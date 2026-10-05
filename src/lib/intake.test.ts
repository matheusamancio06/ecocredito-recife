// Entrada do registro de entulho, do formulário ao banco: validações, foto e confirmação.
import { beforeEach, describe, expect, it, vi } from "vitest";

// As fotos vão para a tabela `photos` (como na hospedagem com Postgres), sem tocar o disco.
vi.hoisted(() => {
  process.env.PHOTO_STORAGE = "db";
});

import sharp from "sharp";
import { getDb, setDbForTests } from "./db";
import { freshDb } from "./test-db";
import { MAX_ACTIONS_PER_HOUR } from "./domain";
import { intakeFlag, intakeReport } from "./report-intake";
import { getReport, upsertUserFromIdentity, type User } from "./repo";

const SPOT = { lat: "-8.1049", lng: "-34.9107" };

async function photo(): Promise<File> {
  const data = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 120, g: 130, b: 110 } } })
    .withExif({ IFD0: { Make: "Camera" } })
    .jpeg()
    .toBuffer();
  return new File([new Uint8Array(data)], "foto.jpg", { type: "image/jpeg" });
}

function form(fields: Record<string, string>, file?: File): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  if (file) data.append("photo", file);
  return data;
}

async function photoCount(): Promise<number> {
  const db = await getDb();
  const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM photos`);
  return rows[0].n;
}

describe("entrada do registro de entulho", () => {
  let ana: User;
  let roberto: User;

  beforeEach(async () => {
    setDbForTests(await freshDb());
    ana = await upsertUserFromIdentity({ sub: "s-ana", cpf: "000.000.000-11", name: "Ana" }, { role: "CIDADAO" });
    roberto = await upsertUserFromIdentity({ sub: "s-rob", cpf: "000.000.000-12", name: "Roberto" }, { role: "CIDADAO" });
  });

  it("pede o local quando as coordenadas faltam", async () => {
    const result = await intakeReport(ana.id, form({ lat: "", lng: "" }, await photo()));
    expect(result).toEqual({ ok: false, error: "Marque no mapa onde está o entulho." });
    expect(await photoCount()).toBe(0);
  });

  it("recusa local fora do Recife", async () => {
    const result = await intakeReport(ana.id, form({ lat: "-23.55", lng: "-46.63" }, await photo()));
    expect(result).toEqual({ ok: false, error: "O local precisa estar dentro do Recife." });
  });

  it("exige a foto", async () => {
    const result = await intakeReport(ana.id, form(SPOT));
    expect(result).toEqual({ ok: false, error: "Envie uma foto do entulho." });
  });

  it("recusa arquivo que não é imagem, sem guardar nada", async () => {
    const fake = new File(["isto não é uma foto"], "foto.jpg", { type: "image/jpeg" });
    const result = await intakeReport(ana.id, form(SPOT, fake));
    expect(result.ok).toBe(false);
    expect(await photoCount()).toBe(0);
  });

  it("registra: guarda a foto sem metadados e cria o registro aberto", async () => {
    const result = await intakeReport(ana.id, form({ ...SPOT, note: "  Em frente ao poste 42  " }, await photo()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe("created");
    expect(intakeFlag(result)).toBe("nova=1");

    const report = (await getReport(result.reportId))!;
    expect(report.status).toBe("ABERTA");
    expect(report.note).toBe("Em frente ao poste 42");

    const db = await getDb();
    const { rows } = await db.query<{ mime: string; bytes: Uint8Array }>(`SELECT mime, bytes FROM photos WHERE name = $1`, [
      report.photoBefore,
    ]);
    expect(rows[0].mime).toBe("image/jpeg");
    expect((await sharp(Buffer.from(rows[0].bytes)).metadata()).exif).toBeUndefined();
  });

  it("o mesmo ponto registrado por outra pessoa só confirma, sem guardar outra foto", async () => {
    const first = await intakeReport(ana.id, form(SPOT, await photo()));
    expect(await photoCount()).toBe(1);

    const second = await intakeReport(roberto.id, form(SPOT, await photo()));
    expect(second.ok && second.kind).toBe("confirmed");
    if (second.ok && first.ok) {
      expect(second.reportId).toBe(first.reportId);
      expect(second.alreadyConfirmed).toBe(false);
      expect(intakeFlag(second)).toBe("confirmada=1");
    }
    expect(await photoCount()).toBe(1);

    const again = await intakeReport(roberto.id, form(SPOT, await photo()));
    if (again.ok) expect(intakeFlag(again)).toBe("ja=1");
  });

  it("aceita a hora da captura de um envio atrasado, mas não datas futuras nem muito antigas", async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
    const late = await intakeReport(ana.id, form({ ...SPOT, capturadoEm: twoDaysAgo.toISOString() }, await photo()));
    expect(late.ok).toBe(true);
    if (late.ok) {
      const created = (await getReport(late.reportId))!.createdAt.getTime();
      expect(Math.abs(created - twoDaysAgo.getTime())).toBeLessThan(1000);
    }

    const future = await intakeReport(
      ana.id,
      form({ lat: "-8.05", lng: "-34.88", capturadoEm: new Date(Date.now() + 86_400_000).toISOString() }, await photo()),
    );
    if (future.ok) expect((await getReport(future.reportId))!.createdAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);

    const old = await intakeReport(
      ana.id,
      form({ lat: "-8.06", lng: "-34.89", capturadoEm: "2020-01-01T00:00:00Z" }, await photo()),
    );
    if (old.ok) expect((await getReport(old.reportId))!.createdAt.getFullYear()).toBeGreaterThan(2020);
  });

  it("limita quantos registros e confirmações uma pessoa envia por hora", async () => {
    for (let i = 0; i < MAX_ACTIONS_PER_HOUR; i++) {
      const lat = (-8.2 + 0.02 * (i + 1)).toFixed(5);
      const ok = await intakeReport(ana.id, form({ lat, lng: "-34.9" }, await photo()));
      expect(ok.ok).toBe(true);
    }
    const blocked = await intakeReport(ana.id, form({ lat: "-8.0", lng: "-34.9" }, await photo()));
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toMatch(/última hora/);
  });
});
