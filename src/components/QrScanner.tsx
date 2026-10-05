"use client";

import { useEffect, useRef } from "react";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";

const ELEMENT_ID = "qr-reader-desk";

/**
 * Câmera para ler o QR Code do cidadão. Liga ao montar e desliga ao desmontar.
 * O stop só é chamado com a câmera de fato rodando; se o componente sair antes
 * do start() terminar (ex.: Strict Mode em desenvolvimento), a câmera é
 * desligada assim que terminar de ligar.
 */
export function QrScanner({ onScan, onError }: { onScan: (text: string) => void; onError: (message: string) => void }) {
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onScanRef.current = onScan;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    let active = true;
    let handled = false;
    const scanner = new Html5Qrcode(ELEMENT_ID);

    const stopIfScanning = () =>
      scanner.getState() === Html5QrcodeScannerState.SCANNING
        ? scanner.stop().then(() => scanner.clear())
        : Promise.resolve();

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (text) => {
          if (handled) return;
          handled = true;
          onScanRef.current(text);
        },
        () => undefined,
      )
      .then(() => {
        if (!active) void stopIfScanning();
      })
      .catch(() => {
        if (active) onErrorRef.current("Não foi possível acessar a câmera. Digite o código.");
      });

    return () => {
      active = false;
      stopIfScanning().catch(() => undefined);
    };
  }, []);

  return <div id={ELEMENT_ID} className="w-full overflow-hidden rounded-2xl border-4 border-brand bg-black" style={{ minHeight: 280 }} />;
}
