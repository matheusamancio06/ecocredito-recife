"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MAX_ATTEMPTS, QUEUE_CHANGED_EVENT, flushQueue, listPending } from "@/lib/offline-queue";

/**
 * Cuida da fila offline em segundo plano: tenta enviar ao abrir o app e sempre
 * que a conexão volta, e mostra uma faixa enquanto houver algo guardado.
 */
export function OfflineSync() {
  const router = useRouter();
  const [pending, setPending] = useState(0);
  const [stuck, setStuck] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let alive = true;

    const apply = (items: { attempts: number }[]) => {
      if (!alive) return;
      setPending(items.length);
      setStuck(items.filter((i) => i.attempts >= MAX_ATTEMPTS).length);
    };

    const refresh = () => {
      listPending().then(apply, () => apply([]));
    };

    const sync = () => {
      listPending().then((items) => {
        if (!alive) return;
        apply(items);
        if (items.length === 0 || !navigator.onLine) return;
        setSyncing(true);
        flushQueue()
          .then((result) => {
            // Chegou registro novo no servidor: a lista da tela precisa refletir isso.
            if (result.sent > 0) router.refresh();
          })
          .catch(() => undefined)
          .finally(() => {
            if (!alive) return;
            setSyncing(false);
            refresh();
          });
      }, () => apply([]));
    };

    sync();
    window.addEventListener(QUEUE_CHANGED_EVENT, refresh);
    window.addEventListener("online", sync);
    return () => {
      alive = false;
      window.removeEventListener(QUEUE_CHANGED_EVENT, refresh);
      window.removeEventListener("online", sync);
    };
  }, [router]);

  if (pending === 0) return null;

  return (
    <div
      role="status"
      className="sticky bottom-0 z-[900] border-t border-line bg-st-nova-bg px-4 py-2 text-center text-sm font-semibold text-st-nova"
    >
      {syncing
        ? `Enviando ${pending} registro(s) guardado(s)…`
        : stuck > 0
          ? `${stuck} registro(s) não puderam ser enviados. Abra "Meus registros" para ver o motivo.`
          : `${pending} registro(s) aguardando internet para serem enviados.`}
    </div>
  );
}
