"use client";

import { useEffect, useState } from "react";
import { MAX_ATTEMPTS, QUEUE_CHANGED_EVENT, listPending, remove, type PendingReport } from "@/lib/offline-queue";

function describe(item: PendingReport): string {
  const note = item.fields.note;
  return note ? note : "Registro de entulho";
}

/** Registros guardados no aparelho, ainda não enviados. */
export function PendingReports() {
  const [items, setItems] = useState<PendingReport[]>([]);

  // A fila vive no IndexedDB (fora do React): aqui só acompanhamos as mudanças.
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      listPending().then(
        (next) => alive && setItems(next),
        () => alive && setItems([]),
      );
    };
    refresh();
    window.addEventListener(QUEUE_CHANGED_EVENT, refresh);
    return () => {
      alive = false;
      window.removeEventListener(QUEUE_CHANGED_EVENT, refresh);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="mb-4 rounded-2xl border border-st-nova/30 bg-st-nova-bg p-4">
      <h2 className="text-base font-bold text-st-nova">Aguardando envio ({items.length})</h2>
      <p className="mb-3 text-sm text-st-nova">Guardadas neste aparelho. Saem sozinhas quando houver internet.</p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-white p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{describe(item)}</p>
              <p className="text-xs text-ink-muted">
                {new Date(item.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                {item.attempts > 0 && ` · ${item.attempts} tentativa(s)`}
              </p>
              {item.attempts >= MAX_ATTEMPTS && item.lastError && (
                <p className="mt-0.5 text-xs font-semibold text-danger">{item.lastError}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => void remove(item.id)}
              className="min-h-10 shrink-0 rounded-lg border border-line px-3 text-sm font-semibold hover:bg-canvas"
            >
              Descartar
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
