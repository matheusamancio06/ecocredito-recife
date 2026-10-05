"use server";

import QRCode from "qrcode";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { claimQrCode, formatCode, issueQrCode, registerDelivery } from "@/lib/credits";
import { MAX_CODE_ATTEMPTS_PER_HOUR } from "@/lib/domain";
import { DomainError } from "@/lib/repo";
import { clearLimit, hitLimit } from "@/lib/throttle";

export type IssuedQr =
  | { ok: true; formatted: string; expiresAt: string; image: string }
  | { ok: false; error: string };

/** Emite o código de uso único do cidadão e o desenha como QR Code. */
export async function issueQrAction(): Promise<IssuedQr> {
  const user = await requireUser("CIDADAO");
  // Um código por vez já é garantido pela emissão; o limite evita que um script
  // fique gerando códigos em sequência.
  if (!(await hitLimit(`qr:${user.id}`, 20, 600))) {
    return { ok: false, error: "Muitos códigos gerados seguidos. Espere alguns minutos." };
  }
  const { code, expiresAt } = await issueQrCode(user.id);
  const image = await QRCode.toDataURL(code, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
    color: { dark: "#23310d", light: "#ffffff" },
  });
  return { ok: true, formatted: formatCode(code), expiresAt: expiresAt.toISOString(), image };
}

export type LookupResult = { ok: true; citizenName: string; expiresAt: string } | { ok: false; error: string };

/** Passo de identificação: confere o código sem consumi-lo e dá tempo para pesar. */
export async function lookupCodeAction(code: string): Promise<LookupResult> {
  const operator = await requireUser("OPERADOR");
  const bucket = `codigo:${operator.id}`;
  // Tentar códigos até acertar um válido é caro para quem tenta: o limite é por
  // operador e por hora, e zera assim que um código legítimo é conferido.
  if (!(await hitLimit(bucket, MAX_CODE_ATTEMPTS_PER_HOUR, 3600))) {
    return { ok: false, error: "Muitas tentativas seguidas. Espere alguns minutos antes de tentar de novo." };
  }

  const preview = await claimQrCode(String(code));
  if (!preview) return { ok: false, error: "Código inválido, expirado ou já utilizado." };
  await clearLimit(bucket);
  return { ok: true, citizenName: preview.displayName, expiresAt: preview.expiresAt.toISOString() };
}

export type DeliveryResult =
  | { ok: true; citizenName: string; material: string; quantity: number; unit: string; points: number }
  | { ok: false; error: string };

export async function registerDeliveryAction(input: {
  code: string;
  material: string;
  quantity: number;
}): Promise<DeliveryResult> {
  const operator = await requireUser("OPERADOR");
  try {
    const receipt = await registerDelivery(operator, {
      code: String(input.code),
      material: String(input.material),
      quantity: Number(input.quantity),
    });
    revalidatePath("/gestor");
    return {
      ok: true,
      citizenName: receipt.citizenName,
      material: receipt.material,
      quantity: receipt.quantity,
      unit: receipt.unit,
      points: receipt.points,
    };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message };
    throw error;
  }
}
