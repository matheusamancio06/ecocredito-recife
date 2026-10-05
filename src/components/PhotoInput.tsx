"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";

const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.82;

// Reduz a foto no aparelho antes do envio: economiza dados móveis e, como o
// canvas gera um JPEG novo, também descarta os metadados EXIF (GPS, modelo
// do celular) que a pessoa não escolheu compartilhar.
async function downscale(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas indisponível");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("falha ao gerar imagem"))), "image/jpeg", JPEG_QUALITY);
  });
}

export function PhotoInput({
  name,
  label,
  hint,
  required = true,
}: {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
}) {
  const pickerId = `${useId()}-picker`;
  const hiddenRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await downscale(file);
      const processed = new File([blob], "foto.jpg", { type: "image/jpeg" });
      const transfer = new DataTransfer();
      transfer.items.add(processed);
      if (hiddenRef.current) hiddenRef.current.files = transfer.files;
      setPreview(URL.createObjectURL(processed));
    } catch {
      setError("Não foi possível ler esta foto. Tente tirar outra.");
      if (hiddenRef.current) hiddenRef.current.value = "";
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label htmlFor={pickerId} className="mb-1 block text-base font-semibold">
        {label}
      </label>
      {hint && <p className="mb-2 text-sm text-ink-muted">{hint}</p>}

      <label
        htmlFor={pickerId}
        className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-brand-strong/40 bg-white p-4 text-center hover:bg-brand-soft"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Pré-visualização da foto escolhida" className="max-h-64 rounded-xl object-contain" />
        ) : (
          <span className="text-base font-semibold text-brand-strong">
            {busy ? "Preparando a foto…" : "Tirar foto ou escolher da galeria"}
          </span>
        )}
        {preview && <span className="text-sm font-semibold text-brand-strong">Toque para trocar a foto</span>}
      </label>

      <input
        id={pickerId}
        type="file"
        accept="image/*"
        required={required}
        onChange={handleChange}
        className="sr-only"
      />
      <input ref={hiddenRef} type="file" name={name} hidden />

      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
