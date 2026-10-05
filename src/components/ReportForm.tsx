"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { enqueue } from "@/lib/offline-queue";

const FIELDS = ["lat", "lng", "note"];

/**
 * Envio do registro de entulho. Se a internet falhar, o formulário guarda tudo no
 * aparelho em vez de perder o trabalho da pessoa: a fila reenvia sozinha
 * quando a conexão voltar.
 */
export function ReportForm({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "saved">("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "sending") return;
    const form = event.currentTarget;
    const data = new FormData(form);
    // A hora da captura viaja junto: um registro que passou a noite na fila
    // não pode chegar datada de quando o sinal voltou.
    data.append("capturadoEm", new Date().toISOString());

    const photo = data.get("photo");
    if (!(photo instanceof File) || photo.size === 0) {
      setError("Envie uma foto do entulho.");
      return;
    }
    if (!data.get("lat") || !data.get("lng")) {
      setError("Marque no mapa onde está o entulho.");
      return;
    }

    setError(null);
    setState("sending");

    async function saveForLater(): Promise<boolean> {
      const fields: Record<string, string> = { capturadoEm: String(data.get("capturadoEm")) };
      for (const name of FIELDS) {
        const value = data.get(name);
        if (typeof value === "string" && value !== "") fields[name] = value;
      }
      try {
        await enqueue(fields, photo as File);
        return true;
      } catch {
        return false;
      }
    }

    let response: Response;
    try {
      response = await fetch("/api/ocorrencias", { method: "POST", body: data });
    } catch {
      if (await saveForLater()) {
        setState("saved");
        return;
      }
      setState("idle");
      setError("Sem internet e não foi possível guardar no aparelho. Tente de novo em um lugar com sinal.");
      return;
    }

    if (response.status >= 500) {
      if (await saveForLater()) {
        setState("saved");
        return;
      }
    }

    const result = (await response.json().catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null;
    if (response.ok && result?.url) {
      router.push(result.url);
      return;
    }
    setState("idle");
    setError(result?.error ?? "Não foi possível enviar o registro. Tente de novo.");
  }

  if (state === "saved") {
    return (
      <div className="rounded-2xl border border-line bg-white p-6 text-center">
        <p className="text-2xl font-extrabold">Guardada no aparelho</p>
        <p className="mt-2 text-base text-ink-muted">
          Você está sem internet. O registro foi salvo com a foto e será enviado sozinho assim que a conexão voltar
          — pode fechar o app.
        </p>
        <button
          type="button"
          onClick={() => router.push("/minhas-ocorrencias")}
          className="mt-5 min-h-14 w-full rounded-2xl bg-brand px-6 text-lg font-bold text-ink hover:brightness-95"
        >
          Ver meus registros
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {children}

      <button
        type="submit"
        disabled={state === "sending"}
        className="min-h-14 w-full rounded-2xl bg-brand px-6 text-lg font-bold text-ink transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === "sending" ? "Enviando registro…" : "Enviar registro"}
      </button>

      {error && (
        <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 text-base font-semibold text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
