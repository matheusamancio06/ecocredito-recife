import crypto from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type JWTPayload } from "jose";
import { hashCpf, type GovIdentity } from "./identity";

/**
 * Login Único gov.br (OpenID Connect, código de autorização + PKCE).
 * Baseado no roteiro técnico oficial: https://acesso.gov.br/roteiro-tecnico/
 *
 * ATENÇÃO: ainda não foi exercitado contra o gov.br de verdade, porque as
 * credenciais (client_id e segredo) só podem ser solicitadas por um órgão
 * público. As partes puras (PKCE, URL de autorização, validação do ID token)
 * têm testes; a integração completa deve ser validada em homologação.
 */

export interface GovBrConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Ex.: https://sso.staging.acesso.gov.br (homologação) ou o host de produção. */
  baseUrl: string;
  /** Valor esperado da claim `iss` do ID token; confirme em homologação. */
  issuer: string;
  /** Nível mínimo de confiabilidade exigido: bronze < silver < gold. */
  minLevel: ReliabilityLevel;
}

export type ReliabilityLevel = "bronze" | "silver" | "gold";
const LEVEL_ORDER: ReliabilityLevel[] = ["bronze", "silver", "gold"];

// Cookie curto (assinado) que guarda state, nonce e code_verifier entre a ida e a volta do gov.br.
export const FLOW_COOKIE = "govbr_flow";
export const FLOW_COOKIE_PATH = "/api/auth/govbr";

export const SCOPES = "openid email profile govbr_confiabilidades govbr_confiabilidades_idtoken";

export function getGovBrConfig(env: NodeJS.ProcessEnv = process.env): GovBrConfig | null {
  const { GOVBR_CLIENT_ID, GOVBR_CLIENT_SECRET, GOVBR_REDIRECT_URI, GOVBR_ISSUER } = env;
  if (!GOVBR_CLIENT_ID || !GOVBR_CLIENT_SECRET || !GOVBR_REDIRECT_URI || !GOVBR_ISSUER) return null;
  const baseUrl = (env.GOVBR_BASE_URL ?? "https://sso.staging.acesso.gov.br").replace(/\/$/, "");
  const minLevel = LEVEL_ORDER.includes(env.GOVBR_MIN_LEVEL as ReliabilityLevel)
    ? (env.GOVBR_MIN_LEVEL as ReliabilityLevel)
    : "silver";
  return {
    clientId: GOVBR_CLIENT_ID,
    clientSecret: GOVBR_CLIENT_SECRET,
    redirectUri: GOVBR_REDIRECT_URI,
    baseUrl,
    issuer: GOVBR_ISSUER,
    minLevel,
  };
}

export function isGovBrConfigured(): boolean {
  return getGovBrConfig() !== null;
}

// ---------------------------------------------------------------------------
// PKCE (RFC 7636)
// ---------------------------------------------------------------------------

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function codeChallengeFor(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export interface AuthorizeRequest {
  url: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}

export function buildAuthorizeRequest(config: GovBrConfig): AuthorizeRequest {
  const state = randomToken(16);
  const nonce = randomToken(16);
  const codeVerifier = randomToken(48); // 64 caracteres (o roteiro exige de 43 a 128)

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    scope: SCOPES,
    redirect_uri: config.redirectUri,
    nonce,
    state,
    code_challenge: codeChallengeFor(codeVerifier),
    code_challenge_method: "S256",
  });
  return { url: `${config.baseUrl}/authorize?${params.toString()}`, state, nonce, codeVerifier };
}

// ---------------------------------------------------------------------------
// Troca do código e validação do ID token
// ---------------------------------------------------------------------------

export interface TokenResponse {
  id_token: string;
  access_token: string;
}

export async function exchangeCode(
  config: GovBrConfig,
  code: string,
  codeVerifier: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenResponse> {
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const response = await fetchImpl(`${config.baseUrl}/token`, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
      code_verifier: codeVerifier,
    }),
  });
  if (!response.ok) throw new Error(`gov.br recusou a troca do código (${response.status})`);
  const data = (await response.json()) as Partial<TokenResponse>;
  if (!data.id_token || !data.access_token) throw new Error("resposta do gov.br sem id_token");
  return { id_token: data.id_token, access_token: data.access_token };
}

interface IdTokenClaims extends JWTPayload {
  name?: string;
  reliability_info?: { level?: string };
}

export class GovBrError extends Error {}

// O conjunto de chaves públicas é buscado uma vez por endereço e reaproveitado
// (a biblioteca renova sozinha quando aparece uma chave nova).
const jwksByBaseUrl = new Map<string, JWTVerifyGetKey>();
function remoteKeys(baseUrl: string): JWTVerifyGetKey {
  let keys = jwksByBaseUrl.get(baseUrl);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${baseUrl}/jwk`));
    jwksByBaseUrl.set(baseUrl, keys);
  }
  return keys;
}

/**
 * Valida assinatura (JWKS do gov.br), emissor, público, validade e nonce, e
 * transforma o ID token na identidade usada pelo resto do sistema. Em `sub` o
 * gov.br envia o CPF.
 */
export async function verifyIdToken(
  config: GovBrConfig,
  idToken: string,
  expectedNonce: string,
  keys?: JWTVerifyGetKey,
): Promise<GovIdentity> {
  const resolver = keys ?? remoteKeys(config.baseUrl);
  const { payload } = await jwtVerify<IdTokenClaims>(idToken, resolver, {
    issuer: config.issuer,
    audience: config.clientId,
  });

  if (payload.nonce !== expectedNonce) throw new GovBrError("nonce inválido");
  if (!payload.sub || !/^\d{11}$/.test(payload.sub.replace(/\D/g, ""))) throw new GovBrError("CPF ausente no ID token");

  const level = payload.reliability_info?.level as ReliabilityLevel | undefined;
  if (!level || LEVEL_ORDER.indexOf(level) < LEVEL_ORDER.indexOf(config.minLevel)) {
    throw new GovBrError("nível de confiabilidade da conta gov.br insuficiente");
  }

  const cpf = payload.sub.replace(/\D/g, "");
  // O identificador guardado é um hash: o CPF em claro nunca vai para o banco.
  return { sub: `govbr:${hashCpf(cpf).slice(0, 40)}`, cpf, name: (payload.name ?? "Cidadão").slice(0, 120) };
}
