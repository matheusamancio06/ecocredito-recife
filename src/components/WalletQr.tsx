"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { issueQrAction, type IssuedQr } from "@/app/wallet-actions";

type Issued = Extract<IssuedQr, { ok: true }>;

/**
 * Mostra o QR Code de uso único do cidadão e o renova sozinho quando expira.
 * O código só vale para uma entrega e por poucos minutos, então prints
 * antigos não servem para nada.
 */
export function WalletQr() {
  const [issued, setIssued] = useState<Issued | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState(0);
  const expiryRef = useRef(0);

  // Pede um código novo (o efeito abaixo reage ao contador).
  const renew = useCallback(() => {
    expiryRef.current = 0;
    setLoading(true);
    setRequest((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    issueQrAction()
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          expiryRef.current = new Date(result.expiresAt).getTime();
          setNow(Date.now());
          setIssued(result);
          setError(null);
        } else {
          setError(result.error);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Não foi possível gerar o código. Verifique a conexão e tente de novo.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [request]);

  // Relógio de 1 s. Ao expirar, renova sozinho, mas só com a aba visível.
  useEffect(() => {
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (expiryRef.current && current >= expiryRef.current && document.visibilityState === "visible") {
        renew();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [renew]);

  const secondsLeft = issued ? Math.max(0, Math.ceil((new Date(issued.expiresAt).getTime() - now) / 1000)) : 0;
  const active = issued !== null && secondsLeft > 0;

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="grid size-[17rem] place-items-center rounded-2xl border border-line bg-white p-3">
        {active ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={issued.image} alt="QR Code para mostrar ao operador do ponto" className="size-full" />
        ) : (
          <p className="px-4 text-sm font-semibold text-ink-muted">
            {loading ? "Gerando código…" : issued ? "Código expirado" : "—"}
          </p>
        )}
      </div>

      {active && (
        <>
          <p className="font-mono text-2xl font-bold tracking-widest" aria-label="Código para digitar">
            {issued.formatted}
          </p>
          <p className="text-sm text-ink-muted" aria-live="polite">
            Vale para uma entrega. Expira em <span className="font-bold tabular-nums">{secondsLeft}s</span>.
          </p>
        </>
      )}

      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={renew}
        disabled={loading}
        className="min-h-11 rounded-xl border border-line bg-white px-4 text-sm font-bold hover:bg-canvas disabled:opacity-60"
      >
        Gerar novo código
      </button>
    </div>
  );
}
