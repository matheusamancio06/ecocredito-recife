"use client";

/**
 * Fila de registros de entulho no próprio aparelho.
 *
 * Quem reporta descarte irregular costuma estar na rua, muitas vezes sem sinal.
 * O envio que falha por falta de internet fica guardado aqui (IndexedDB, que
 * aceita a foto inteira, ao contrário do localStorage) e é reenviado quando a
 * conexão volta. Nada é perdido se a pessoa fechar o app no meio.
 */

const DB_NAME = "ecocredito";
const DB_VERSION = 1;
const STORE = "ocorrencias-pendentes";

export interface PendingReport {
  id: string;
  createdAt: number;
  /** Campos do formulário, menos a foto. */
  fields: Record<string, string>;
  photo: Blob;
  attempts: number;
  lastError?: string;
}

export const QUEUE_CHANGED_EVENT = "ecocredito:fila";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB indisponível"));
  });
}

function run<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("falha no armazenamento local"));
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, mode);
    const out = await fn(tx.objectStore(STORE));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("falha no armazenamento local"));
      tx.onabort = () => reject(tx.error ?? new Error("armazenamento local interrompido"));
    });
    return out;
  } finally {
    db.close();
  }
}

function announce(): void {
  window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT));
}

export async function enqueue(fields: Record<string, string>, photo: Blob): Promise<void> {
  const item: PendingReport = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    fields,
    photo,
    attempts: 0,
  };
  await withStore("readwrite", (store) => run(store.add(item)));
  announce();
}

export async function listPending(): Promise<PendingReport[]> {
  const items = await withStore("readonly", (store) => run(store.getAll() as IDBRequest<PendingReport[]>));
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

export async function countPending(): Promise<number> {
  try {
    return await withStore("readonly", (store) => run(store.count()));
  } catch {
    // Navegação privada ou armazenamento bloqueado: a fila simplesmente não existe.
    return 0;
  }
}

export async function remove(id: string): Promise<void> {
  await withStore("readwrite", (store) => run(store.delete(id)));
  announce();
}

async function markAttempt(item: PendingReport, error: string): Promise<void> {
  await withStore("readwrite", (store) => run(store.put({ ...item, attempts: item.attempts + 1, lastError: error })));
  announce();
}

export interface FlushResult {
  sent: number;
  failed: number;
  remaining: number;
}

// Depois de tantas recusas do servidor (foto inválida, por exemplo), parar de
// tentar: insistir não resolve e a pessoa precisa saber.
export const MAX_ATTEMPTS = 3;

/**
 * Reenvia o que está guardado. Erro de rede mantém o item na fila; recusa do
 * servidor (400) conta uma tentativa e, no limite, para de tentar.
 */
export async function flushQueue(): Promise<FlushResult> {
  let sent = 0;
  let failed = 0;
  const pending = await listPending();

  for (const item of pending) {
    if (item.attempts >= MAX_ATTEMPTS) {
      failed += 1;
      continue;
    }
    const body = new FormData();
    for (const [key, value] of Object.entries(item.fields)) body.append(key, value);
    body.append("photo", new File([item.photo], "foto.jpg", { type: "image/jpeg" }));

    let response: Response;
    try {
      response = await fetch("/api/ocorrencias", { method: "POST", body });
    } catch {
      // Continua sem internet: fica na fila, sem contar tentativa.
      break;
    }

    if (response.ok) {
      await remove(item.id);
      sent += 1;
      continue;
    }
    if (response.status >= 500) break; // problema do servidor: tentamos de novo depois
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    await markAttempt(item, data?.error ?? "Não foi possível enviar.");
    failed += 1;
  }

  return { sent, failed, remaining: await countPending() };
}
