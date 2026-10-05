import { DEMO_MODE, LATEST_MIGRATION, USING_MANAGED_POSTGRES, getDb } from "@/lib/db";
import { PHOTO_STORAGE } from "@/lib/uploads";

/**
 * Verificação de saúde para o monitoramento da hospedagem.
 *
 * Responde 503 quando o banco não atende ou quando as migrações estão atrás do
 * código — um deploy pela metade precisa falhar alto, não servir página quebrada.
 * Não expõe endereço de banco, versão de pacote nem nada que ajude um ataque.
 */
export async function GET(): Promise<Response> {
  const startedAt = Date.now();
  try {
    const db = await getDb();
    const { rows } = await db.query<{ version: number }>(
      `SELECT COALESCE(MAX(version), 0)::int AS version FROM schema_migrations`,
    );
    const version = rows[0].version;
    const healthy = version === LATEST_MIGRATION;

    return Response.json(
      {
        ok: healthy,
        banco: "ok",
        migracao: { aplicada: version, esperada: LATEST_MIGRATION },
        armazenamentoFotos: PHOTO_STORAGE,
        postgresGerenciado: USING_MANAGED_POSTGRES,
        modoDemonstracao: DEMO_MODE,
        tempoMs: Date.now() - startedAt,
      },
      { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[saude] banco indisponível:", error instanceof Error ? error.message : error);
    return Response.json(
      { ok: false, banco: "indisponivel", tempoMs: Date.now() - startedAt },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
