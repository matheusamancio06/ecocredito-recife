import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { normalizePhoto, sniffImage } from "./uploads";

/**
 * Uma foto tirada com o celular deitado não vem girada nos pixels: vem com uma
 * etiqueta EXIF dizendo "gire 90°". Quem exibe a foto obedece à etiqueta; quem
 * lê os pixels, não. Normalizar grava o que se vê e remove a etiqueta.
 */
async function photoWithOrientation(orientation: number): Promise<Uint8Array> {
  // Imagem deitada (largura > altura) com uma faixa escura à esquerda, que
  // serve de marca para conferir onde o recorte cai.
  const base = await sharp({
    create: { width: 400, height: 200, channels: 3, background: { r: 240, g: 240, b: 240 } },
  })
    .composite([
      {
        input: await sharp({ create: { width: 80, height: 200, channels: 3, background: { r: 10, g: 10, b: 10 } } })
          .png()
          .toBuffer(),
        left: 0,
        top: 0,
      },
    ])
    .jpeg()
    .toBuffer();
  return new Uint8Array(await sharp(base).withMetadata({ orientation }).toBuffer());
}

describe("normalização da foto enviada", () => {
  it("aplica a rotação do EXIF nos pixels e remove a etiqueta", async () => {
    const original = await photoWithOrientation(6); // 6 = girar 90° no sentido horário
    const before = await sharp(original).metadata();
    expect(before.width).toBe(400);
    expect(before.height).toBe(200);
    expect(before.orientation).toBe(6);

    const normalized = await normalizePhoto(original);
    const after = await sharp(normalized.data).metadata();

    // Depois de normalizar, o que está gravado é o que se vê: a foto deitada
    // virou em pé e não sobrou etiqueta de rotação para ninguém reinterpretar.
    expect(after.width).toBe(200);
    expect(after.height).toBe(400);
    expect(after.orientation).toBeUndefined();
    expect(normalized.width).toBe(200);
    expect(normalized.height).toBe(400);
  });

  it("descarta os metadados que a câmera grava na foto", async () => {
    const withGps = await sharp({
      create: { width: 60, height: 60, channels: 3, background: { r: 200, g: 200, b: 200 } },
    })
      .withExif({ IFD0: { Copyright: "Camera", Make: "Camera" } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withGps).metadata()).exif).toBeDefined();

    const normalized = await normalizePhoto(new Uint8Array(withGps));
    const meta = await sharp(normalized.data).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it("reduz o lado maior e entrega sempre JPEG", async () => {
    const big = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: { r: 120, g: 120, b: 120 } },
    })
      .png()
      .toBuffer();

    const normalized = await normalizePhoto(new Uint8Array(big));
    expect(Math.max(normalized.width, normalized.height)).toBe(1600);
    expect(sniffImage(normalized.data)?.ext).toBe("jpg");
  });

  it("não aumenta uma foto pequena", async () => {
    const small = await sharp({ create: { width: 320, height: 240, channels: 3, background: { r: 1, g: 2, b: 3 } } })
      .jpeg()
      .toBuffer();
    const normalized = await normalizePhoto(new Uint8Array(small));
    expect(normalized.width).toBe(320);
    expect(normalized.height).toBe(240);
  });
});
