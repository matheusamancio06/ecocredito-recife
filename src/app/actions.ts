"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acceptConsent, deleteAccount } from "@/lib/account";
import { HOME_BY_ROLE, requireUser } from "@/lib/auth";
import { exchangeForCapibas } from "@/lib/capiba";
import { loginAsDemoPersona } from "@/lib/demo-login";
import { MAX_EXCHANGES_PER_HOUR, NOTE_MAX_LENGTH } from "@/lib/domain";
import { DomainError, closeReport } from "@/lib/repo";
import { destroySession, revokeAllSessions } from "@/lib/session";
import { hitLimit } from "@/lib/throttle";
import { UploadError, deleteImage, saveImage } from "@/lib/uploads";

export interface ActionState {
  error?: string;
  ok?: string;
}

function toState(error: unknown): ActionState {
  if (error instanceof DomainError || error instanceof UploadError) return { error: error.message };
  throw error;
}

function textOrNull(value: FormDataEntryValue | null, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

const text = (formData: FormData, name: string): string => String(formData.get(name) ?? "");

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------

export async function loginAsPersona(formData: FormData): Promise<void> {
  const home = await loginAsDemoPersona(text(formData, "persona"), (await headers()).get("user-agent"));
  redirect(home ?? "/login?erro=persona");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/");
}

export async function logoutEverywhere(): Promise<void> {
  const user = await requireUser();
  await revokeAllSessions(user.id);
  redirect("/");
}

// ---------------------------------------------------------------------------
// Privacidade (LGPD)
// ---------------------------------------------------------------------------

export async function acceptConsentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (formData.get("aceito") !== "1") return { error: "É preciso aceitar para usar o app." };
  await acceptConsent(user.id);
  redirect(text(formData, "destino") || HOME_BY_ROLE[user.role]);
}

export async function deleteAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (text(formData, "confirmacao").trim().toUpperCase() !== "ENCERRAR") {
    return { error: 'Para confirmar, escreva ENCERRAR no campo indicado.' };
  }
  try {
    await deleteAccount(user.id);
  } catch (error) {
    return toState(error);
  }
  redirect("/?conta=encerrada");
}

// ---------------------------------------------------------------------------
// Troca de EcoCoins por Moeda Capiba
// ---------------------------------------------------------------------------

export async function exchangeCapibaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("CIDADAO");
  const capibas = Number(text(formData, "capibas").trim());
  if (!(await hitLimit(`capiba:${user.id}`, MAX_EXCHANGES_PER_HOUR, 3600))) {
    return { error: "Muitas trocas seguidas. Espere um pouco e tente de novo." };
  }
  try {
    const exchange = await exchangeForCapibas(user.id, capibas);
    revalidatePath("/carteira");
    const plural = exchange.capibas === 1 ? "Capiba" : "Capibas";
    return {
      ok: exchange.simulated
        ? `Troca simulada: ${exchange.capibas} ${plural} por ${exchange.ecocoins} EcoCoins (protocolo ${exchange.protocol}). No ambiente real, as Capibas chegam à sua carteira do Conecta Recife.`
        : `${exchange.capibas} ${plural} creditada(s) na sua carteira do Conecta Recife (protocolo ${exchange.protocol}).`,
    };
  } catch (error) {
    return toState(error);
  }
}

// ---------------------------------------------------------------------------
// Gestão de coleta: dar baixa
// ---------------------------------------------------------------------------

export async function closeReportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("GESTOR");
  const outcome = text(formData, "outcome");
  if (outcome !== "BAIXADA" && outcome !== "IMPROCEDENTE") return { error: "Escolha o resultado da baixa." };

  // A foto do local depois da limpeza é opcional: sem foto, a baixa vale do mesmo jeito.
  const photo = formData.get("photo");
  let photoName: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    try {
      photoName = await saveImage(photo);
    } catch (error) {
      return toState(error);
    }
  }

  try {
    await closeReport(user, text(formData, "id"), {
      outcome,
      note: textOrNull(formData.get("note"), NOTE_MAX_LENGTH),
      photoAfter: photoName,
    });
  } catch (error) {
    if (photoName) await deleteImage(photoName);
    return toState(error);
  }
  revalidatePath("/gestor", "layout");
  revalidatePath("/ocorrencias/[id]", "page");
  return { ok: "Baixa registrada." };
}
