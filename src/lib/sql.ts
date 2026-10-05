import type { Queryable } from "./db";

/**
 * INSERT em lote (várias linhas por comando). Com o Postgres embutido, cada
 * comando tem um custo fixo, então gravar centenas de linhas uma a uma é lento.
 * Nomes de tabela e colunas vêm do código, nunca de entrada do usuário.
 */
export async function insertMany(
  q: Queryable,
  table: string,
  columns: string[],
  rows: unknown[][],
  chunkSize = 150,
): Promise<void> {
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const values = chunk
      .map((_, rowIndex) => `(${columns.map((_c, colIndex) => `$${rowIndex * columns.length + colIndex + 1}`).join(",")})`)
      .join(",");
    await q.query(`INSERT INTO ${table} (${columns.join(",")}) VALUES ${values}`, chunk.flat());
  }
}
