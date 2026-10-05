import { defineConfig } from "vitest/config";

// Cada arquivo de teste de banco sobe um Postgres embutido (WASM); o padrão de 10 s
// é curto quando vários sobem ao mesmo tempo, e poucos processos em paralelo evitam
// esgotar a memória de um computador comum.
export default defineConfig({
  test: { testTimeout: 60_000, hookTimeout: 60_000, maxWorkers: 3 },
});
