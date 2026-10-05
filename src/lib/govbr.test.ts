import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  GovBrError,
  buildAuthorizeRequest,
  codeChallengeFor,
  exchangeCode,
  getGovBrConfig,
  verifyIdToken,
  type GovBrConfig,
} from "./govbr";
import { readPayload, signPayload } from "./signed";

const CONFIG: GovBrConfig = {
  clientId: "eco-recife",
  clientSecret: "segredo",
  redirectUri: "https://exemplo.gov.br/api/auth/govbr/callback",
  baseUrl: "https://sso.staging.acesso.gov.br",
  issuer: "https://sso.staging.acesso.gov.br/",
  minLevel: "silver",
};

describe("PKCE e URL de autorização", () => {
  it("calcula o code_challenge conforme o exemplo da RFC 7636", () => {
    expect(codeChallengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("monta a URL com todos os parâmetros exigidos pelo roteiro do gov.br", () => {
    const request = buildAuthorizeRequest(CONFIG);
    const url = new URL(request.url);
    expect(url.origin + url.pathname).toBe("https://sso.staging.acesso.gov.br/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("eco-recife");
    expect(url.searchParams.get("redirect_uri")).toBe(CONFIG.redirectUri);
    expect(url.searchParams.get("scope")).toContain("openid");
    expect(url.searchParams.get("scope")).toContain("govbr_confiabilidades");
    expect(url.searchParams.get("state")).toBe(request.state);
    expect(url.searchParams.get("nonce")).toBe(request.nonce);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(codeChallengeFor(request.codeVerifier));
    expect(request.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(request.codeVerifier.length).toBeLessThanOrEqual(128);
    expect(request.state).not.toBe(request.nonce);
  });
});

describe("configuração", () => {
  it("só ativa com todas as variáveis e usa homologação e nível prata por padrão", () => {
    expect(getGovBrConfig({} as NodeJS.ProcessEnv)).toBeNull();
    const config = getGovBrConfig({
      GOVBR_CLIENT_ID: "id",
      GOVBR_CLIENT_SECRET: "secret",
      GOVBR_REDIRECT_URI: "https://x/cb",
      GOVBR_ISSUER: "https://sso.staging.acesso.gov.br/",
    } as unknown as NodeJS.ProcessEnv);
    expect(config?.baseUrl).toBe("https://sso.staging.acesso.gov.br");
    expect(config?.minLevel).toBe("silver");
  });
});

describe("troca do código", () => {
  afterEach(() => vi.restoreAllMocks());

  it("autentica com Basic, envia o code_verifier e devolve os tokens", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id_token: "idt", access_token: "at" }), { status: 200 }),
    );
    const tokens = await exchangeCode(CONFIG, "codigo-123", "verificador", fetchMock as unknown as typeof fetch);
    expect(tokens).toEqual({ id_token: "idt", access_token: "at" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://sso.staging.acesso.gov.br/token");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("eco-recife:segredo").toString("base64")}`);
    const body = new URLSearchParams(init.body);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("codigo-123");
    expect(body.get("code_verifier")).toBe("verificador");
  });

  it("falha quando o gov.br recusa", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 400 }));
    await expect(exchangeCode(CONFIG, "x", "y", fetchMock as unknown as typeof fetch)).rejects.toThrow(/recusou/);
  });
});

describe("validação do ID token", () => {
  let privateKey: CryptoKey;
  let publicKey: CryptoKey;

  beforeAll(async () => {
    ({ privateKey, publicKey } = await generateKeyPair("RS256"));
    await exportJWK(publicKey);
  });

  const keys = async () => publicKey;

  async function token(overrides: Record<string, unknown> = {}, opts: { aud?: string; iss?: string } = {}) {
    return new SignJWT({
      sub: "12345678909",
      name: "Fulana de Tal",
      nonce: "nonce-1",
      reliability_info: { level: "silver" },
      ...overrides,
    })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(opts.iss ?? CONFIG.issuer)
      .setAudience(opts.aud ?? CONFIG.clientId)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
  }

  it("aceita um token válido e não expõe o CPF no identificador guardado", async () => {
    const identity = await verifyIdToken(CONFIG, await token(), "nonce-1", keys);
    expect(identity.name).toBe("Fulana de Tal");
    expect(identity.cpf).toBe("12345678909");
    expect(identity.sub.startsWith("govbr:")).toBe(true);
    expect(identity.sub).not.toContain("12345678909");
  });

  it("rejeita nonce, público e emissor errados", async () => {
    await expect(verifyIdToken(CONFIG, await token(), "outro-nonce", keys)).rejects.toBeInstanceOf(GovBrError);
    await expect(verifyIdToken(CONFIG, await token({}, { aud: "outro" }), "nonce-1", keys)).rejects.toThrow();
    await expect(verifyIdToken(CONFIG, await token({}, { iss: "https://falso/" }), "nonce-1", keys)).rejects.toThrow();
  });

  it("rejeita assinatura de outra chave", async () => {
    const other = await generateKeyPair("RS256");
    const forged = await new SignJWT({ sub: "12345678909", nonce: "nonce-1", reliability_info: { level: "gold" } })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(CONFIG.issuer)
      .setAudience(CONFIG.clientId)
      .setExpirationTime("5m")
      .sign(other.privateKey);
    await expect(verifyIdToken(CONFIG, forged, "nonce-1", keys)).rejects.toThrow();
  });

  it("exige o nível mínimo de confiabilidade e um CPF válido", async () => {
    await expect(
      verifyIdToken(CONFIG, await token({ reliability_info: { level: "bronze" } }), "nonce-1", keys),
    ).rejects.toThrow(/confiabilidade/);
    await expect(verifyIdToken(CONFIG, await token({ reliability_info: undefined }), "nonce-1", keys)).rejects.toThrow();
    await expect(verifyIdToken(CONFIG, await token({ sub: "abc" }), "nonce-1", keys)).rejects.toThrow(/CPF/);
    const gold = await verifyIdToken({ ...CONFIG, minLevel: "gold" }, await token({ reliability_info: { level: "gold" } }), "nonce-1", keys);
    expect(gold.cpf).toBe("12345678909");
  });
});

describe("valores assinados", () => {
  it("valida, detecta adulteração e expira", () => {
    const token = signPayload({ a: 1 }, 60, 1_000_000);
    expect(readPayload<{ a: number }>(token, 1_000_000 + 30_000)?.a).toBe(1);
    expect(readPayload(token, 1_000_000 + 61_000)).toBeNull();
    const tampered = `${Buffer.from(JSON.stringify({ a: 2, exp: 99999999999 })).toString("base64url")}.${token.split(".")[1]}`;
    expect(readPayload(tampered, 1_000_000)).toBeNull();
    expect(readPayload(undefined)).toBeNull();
    expect(readPayload("lixo")).toBeNull();
  });
});
