import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { DATA_DIR, USING_MANAGED_POSTGRES, getDb } from "./db";

const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// Onde as fotos ficam. Em hospedagem serverless o disco some a cada deploy, então
// com Postgres gerenciado o padrão passa a ser o próprio banco.
export const PHOTO_STORAGE: "fs" | "db" =
  process.env.PHOTO_STORAGE === "db" || process.env.PHOTO_STORAGE === "fs"
    ? process.env.PHOTO_STORAGE
    : USING_MANAGED_POSTGRES
      ? "db"
      : "fs";

export class UploadError extends Error {}

export interface ImageKind {
  ext: "jpg" | "png" | "webp";
  mime: "image/jpeg" | "image/png" | "image/webp";
}

// Identifica o formato pelos primeiros bytes; nunca confiamos no tipo/nome enviado.
export function sniffImage(buf: Uint8Array): ImageKind | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: "jpg", mime: "image/jpeg" };
  }
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length >= 8 && pngSignature.every((b, i) => buf[i] === b)) {
    return { ext: "png", mime: "image/png" };
  }
  const ascii = (start: number, end: number) => String.fromCharCode(...buf.slice(start, end));
  if (buf.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    return { ext: "webp", mime: "image/webp" };
  }
  return null;
}

export interface ValidUpload extends ImageKind {
  data: Uint8Array;
}

/** Valida tamanho e formato, sem gravar nada em disco. */
export async function readUpload(file: File): Promise<ValidUpload> {
  if (file.size === 0) throw new UploadError("Envie uma foto do entulho.");
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError("A foto é muito grande (máximo de 5 MB).");

  const data = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(data);
  if (!kind) throw new UploadError("Formato inválido. Envie uma foto JPEG, PNG ou WebP.");
  return { ...kind, data };
}

const MAX_SIDE = 1600;
const JPEG_QUALITY = 82;

export interface NormalizedPhoto {
  data: Buffer;
  width: number;
  height: number;
}

/**
 * Deixa a foto num formato único antes de guardá-la:
 *
 * 1. aplica a rotação do EXIF e a remove (`rotate()` sem ângulo). Sem isso, uma
 *    foto tirada de lado apareceria girada para quem não respeita a etiqueta;
 * 2. descarta todos os metadados, inclusive a coordenada de GPS que a câmera
 *    grava — a localização que vale é a que a pessoa marcou no mapa;
 * 3. reduz o lado maior e reexporta em JPEG, para o tamanho não depender do aparelho.
 */
export async function normalizePhoto(image: Uint8Array): Promise<NormalizedPhoto> {
  const { data, info } = await sharp(image)
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export async function storeImageBytes(data: Uint8Array, ext: ImageKind["ext"]): Promise<string> {
  const name = `${crypto.randomUUID()}.${ext}`;
  if (PHOTO_STORAGE === "db") {
    const db = await getDb();
    const mime = sniffImage(data)?.mime ?? "application/octet-stream";
    await db.query(`INSERT INTO photos (name, mime, bytes) VALUES ($1,$2,$3)`, [name, mime, Buffer.from(data)]);
    return name;
  }
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, name), data);
  return name;
}

/**
 * Valida, normaliza (rotação e metadados) e guarda. Devolve o nome do arquivo.
 * Usada na foto "depois" da baixa; o registro do cidadão passa por intakeReport.
 */
export async function saveImage(file: File): Promise<string> {
  const upload = await readUpload(file);
  const normalized = await normalizePhoto(upload.data);
  return storeImageBytes(normalized.data, "jpg");
}

const SAFE_NAME = /^[a-f0-9-]{36}\.(jpg|png|webp)$/;

export function isStoredPhotoName(name: string): boolean {
  return SAFE_NAME.test(name);
}

export async function readImage(name: string): Promise<{ data: Buffer; mime: string } | null> {
  if (!isStoredPhotoName(name)) return null;
  if (PHOTO_STORAGE === "db") {
    const db = await getDb();
    const { rows } = await db.query<{ mime: string; bytes: Uint8Array }>(
      `SELECT mime, bytes FROM photos WHERE name = $1`,
      [name],
    );
    return rows[0] ? { data: Buffer.from(rows[0].bytes), mime: rows[0].mime } : null;
  }
  try {
    const data = await fs.readFile(path.join(UPLOAD_DIR, name));
    const kind = sniffImage(data);
    return kind ? { data, mime: kind.mime } : null;
  } catch {
    return null;
  }
}

export async function deleteImage(name: string): Promise<void> {
  if (!isStoredPhotoName(name)) return;
  if (PHOTO_STORAGE === "db") {
    const db = await getDb();
    await db.query(`DELETE FROM photos WHERE name = $1`, [name]);
    return;
  }
  await fs.rm(path.join(UPLOAD_DIR, name), { force: true });
}
