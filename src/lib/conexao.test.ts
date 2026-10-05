// Conexão com o Postgres gerenciado (Supabase): TLS e a URL de conexão.
import { describe, expect, it } from "vitest";
import { pgSsl, withoutSslMode } from "./db";

describe("TLS com o Postgres gerenciado", () => {
  it("por padrão valida o certificado", () => {
    expect(pgSsl({})).toEqual({ rejectUnauthorized: true });
  });

  it("aceita o certificado da autoridade do banco (com \\n no lugar das quebras de linha)", () => {
    const ssl = pgSsl({ PGSSL_CA: "-----BEGIN CERTIFICATE-----\\nABC\\n-----END CERTIFICATE-----" });
    expect(ssl).toEqual({
      rejectUnauthorized: true,
      ca: "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----",
    });
  });

  it("o certificado informado vale mais que no-verify", () => {
    const ssl = pgSsl({ PGSSL_CA: "-----BEGIN CERTIFICATE-----\\nX\\n-----END CERTIFICATE-----", PGSSLMODE: "no-verify" });
    expect(ssl && ssl.rejectUnauthorized).toBe(true);
  });

  it("no-verify mantém a conexão cifrada sem conferir o certificado", () => {
    expect(pgSsl({ PGSSLMODE: "no-verify" })).toEqual({ rejectUnauthorized: false });
  });

  it("disable desliga o TLS (banco local)", () => {
    expect(pgSsl({ PGSSLMODE: "disable" })).toBe(false);
  });
});

describe("URL de conexão", () => {
  it("tira sslmode, que passaria por cima da configuração de TLS", () => {
    const url = withoutSslMode("postgresql://postgres.abc:senha123@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require&x=1");
    expect(url).not.toContain("sslmode");
    expect(url).toContain("x=1");
    expect(url).toContain("pooler.supabase.com:6543");
  });

  it("mantém a URL como está quando não há sslmode", () => {
    const original = "postgresql://postgres.abc:senha123@host.supabase.com:6543/postgres";
    expect(withoutSslMode(original)).toBe(original);
  });

  it("não quebra com um texto que não é URL", () => {
    expect(withoutSslMode("isto não é uma url")).toBe("isto não é uma url");
  });
});
