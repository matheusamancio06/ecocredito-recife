"use client";

import { useState, useTransition } from "react";
import { lookupCodeAction, registerDeliveryAction, type DeliveryResult } from "@/app/wallet-actions";
import { QrScanner } from "./QrScanner";
import { inputClass } from "./ui";

export interface DeskMaterial {
  value: string;
  label: string;
  unit: "KG" | "L";
  pointsPerUnit: number;
}

type Stage = "identify" | "weigh" | "done";

const bigButton =
  "min-h-14 w-full rounded-2xl px-6 text-lg font-bold transition disabled:cursor-not-allowed disabled:opacity-60";

export function OperatorDesk({ materials }: { materials: DeskMaterial[] }) {
  const [stage, setStage] = useState<Stage>("identify");
  const [code, setCode] = useState("");
  const [citizen, setCitizen] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [material, setMaterial] = useState(materials[0]?.value ?? "");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Extract<DeliveryResult, { ok: true }> | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = materials.find((m) => m.value === material);
  const parsedQuantity = Number(quantity.replace(",", "."));
  const validQuantity = quantity.trim() !== "" && parsedQuantity > 0;
  const estimate = selected && validQuantity ? Math.round(parsedQuantity * selected.pointsPerUnit) : 0;

  function identify(rawCode: string) {
    setError(null);
    startTransition(async () => {
      const result = await lookupCodeAction(rawCode);
      if (result.ok) {
        setCode(rawCode);
        setCitizen(result.citizenName);
        setScanning(false);
        setStage("weigh");
      } else {
        setError(result.error);
        setScanning(false);
      }
    });
  }

  function confirm() {
    if (!selected || !validQuantity) return;
    setError(null);
    startTransition(async () => {
      const result = await registerDeliveryAction({ code, material, quantity: parsedQuantity });
      if (result.ok) {
        setReceipt(result);
        setStage("done");
      } else {
        setError(result.error);
      }
    });
  }

  function reset() {
    setStage("identify");
    setCode("");
    setCitizen(null);
    setQuantity("");
    setReceipt(null);
    setError(null);
  }

  return (
    <div className="space-y-5">
      {stage === "identify" && (
        <div className="space-y-4">
          {scanning ? (
            <>
              <QrScanner
                onScan={identify}
                onError={(message) => {
                  setScanning(false);
                  setError(message);
                }}
              />
              <button
                type="button"
                onClick={() => setScanning(false)}
                className={`${bigButton} border border-line bg-white hover:bg-canvas`}
              >
                Digitar o código
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setScanning(true);
                }}
                className={`${bigButton} bg-brand text-ink hover:brightness-95`}
              >
                Ler QR Code com a câmera
              </button>

              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  identify(code);
                }}
              >
                <label className="block">
                  <span className="mb-1 block text-base font-semibold">Ou digite o código do cidadão</span>
                  <input
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="XXXXX-XXXXX"
                    className={`${inputClass} font-mono text-xl tracking-widest`}
                  />
                </label>
                <button
                  type="submit"
                  disabled={pending || code.trim().length < 6}
                  className={`${bigButton} border border-line bg-white hover:bg-canvas`}
                >
                  {pending ? "Conferindo…" : "Conferir código"}
                </button>
              </form>
            </>
          )}
        </div>
      )}

      {stage === "weigh" && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-2xl bg-brand p-5 text-ink">
            <span aria-hidden="true" className="text-3xl">
              ✓
            </span>
            <div>
              <p className="text-xl font-bold">Cidadão identificado</p>
              <p className="text-base">{citizen}</p>
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-base font-semibold">Material</span>
            <select value={material} onChange={(event) => setMaterial(event.target.value)} className={`${inputClass} text-lg`}>
              {materials.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label} ({m.pointsPerUnit} EcoCoins por {m.unit === "L" ? "litro" : "kg"})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-base font-semibold">
              {selected?.unit === "L" ? "Volume (L)" : "Peso (kg)"}
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="0,0"
              className={`${inputClass} text-lg`}
            />
          </label>

          {estimate > 0 && (
            <p className="text-center text-lg text-ink-muted">
              Serão creditados <span className="font-extrabold text-brand-strong">{estimate} EcoCoins</span>
            </p>
          )}

          <button
            type="button"
            onClick={confirm}
            disabled={pending || !validQuantity}
            className={`${bigButton} bg-ink text-white hover:opacity-90`}
          >
            {pending ? "Creditando…" : "Confirmar e creditar EcoCoins"}
          </button>
          <button type="button" onClick={reset} className={`${bigButton} border border-line bg-white hover:bg-canvas`}>
            Cancelar
          </button>
        </div>
      )}

      {stage === "done" && receipt && (
        <div className="flex flex-col items-center gap-5 py-6 text-center">
          <div className="grid size-24 place-items-center rounded-full bg-brand text-5xl text-ink" aria-hidden="true">
            ✓
          </div>
          <h2 className="text-2xl font-extrabold">Entrega registrada</h2>
          <p className="text-lg">
            <span className="font-extrabold text-brand-strong">+{receipt.points} EcoCoins</span> para {receipt.citizenName}
          </p>
          <p className="text-sm text-ink-muted">
            {receipt.quantity.toString().replace(".", ",")} {receipt.unit === "L" ? "L" : "kg"} de{" "}
            {materials.find((m) => m.value === receipt.material)?.label ?? receipt.material}
          </p>
          <button type="button" onClick={reset} className={`${bigButton} bg-brand text-ink hover:brightness-95`}>
            Atender próximo cidadão
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 text-base font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
