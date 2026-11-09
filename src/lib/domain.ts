export const ROLES = ["CIDADAO", "OPERADOR", "GESTOR"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  CIDADAO: "Cidadão",
  OPERADOR: "Operador de ponto",
  GESTOR: "Gestão de coleta",
};

// Situação de um registro de entulho. "Dar baixa" leva o registro de ABERTA para
// uma das duas situações finais: o entulho foi removido (BAIXADA) ou o registro
// não procede, por exemplo porque não havia nada no local (IMPROCEDENTE).
export const STATUSES = ["ABERTA", "BAIXADA", "IMPROCEDENTE"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  ABERTA: "Aberto",
  BAIXADA: "Baixado",
  IMPROCEDENTE: "Não procedente",
};

export function isOpen(status: Status): boolean {
  return status === "ABERTA";
}

// Raio para tratar dois registros como o mesmo ponto (a segunda pessoa apenas
// confirma) e para detectar reincidência em local que acabou de ser limpo.
export const SAME_SPOT_METERS = 30;
export const RECURRENCE_WINDOW_DAYS = 60;

export const NOTE_MAX_LENGTH = 300;

// ---------------------------------------------------------------------------
// Pontos de descarte e coleta (dados abertos da Prefeitura do Recife)
// ---------------------------------------------------------------------------

export const POINT_KINDS = ["PEV", "ECOPONTO", "ECOESTACAO", "COOPERATIVA", "OUTRO"] as const;
export type PointKind = (typeof POINT_KINDS)[number];

export const POINT_KIND_LABEL: Record<PointKind, string> = {
  PEV: "Ponto de entrega voluntária",
  ECOPONTO: "Ecoponto",
  ECOESTACAO: "Ecoestação",
  COOPERATIVA: "Cooperativa",
  OUTRO: "Ponto de coleta",
};

// Os dados abertos trazem onze categorias; o app só usa as que servem ao entulho
// e à reciclagem que gera EcoCoins.
export const POINT_CATEGORIES = ["RECICLAVEL", "ELETRONICO", "OLEO", "ENTULHO"] as const;
export type PointCategory = (typeof POINT_CATEGORIES)[number];

export const POINT_CATEGORY_LABEL: Record<PointCategory, string> = {
  RECICLAVEL: "Recicláveis (papel, plástico, metal, vidro)",
  ELETRONICO: "Eletrônicos",
  OLEO: "Óleo de cozinha",
  ENTULHO: "Entulho de obra",
};

// Pontos com atendente podem pesar e conferir entregas (base do EcoCrédito).
// PEVs e ecopontos são contêineres sem atendente.
export const STAFFED_KINDS: readonly PointKind[] = ["ECOESTACAO", "COOPERATIVA"];

// Até onde consideramos um ponto de descarte "perto" (a pé com material).
export const NEAR_POINT_METERS = 1000;

// ---------------------------------------------------------------------------
// EcoCrédito: materiais reciclados, pesagem e EcoCoins
// ---------------------------------------------------------------------------

export const MATERIALS = ["OLEO_COZINHA", "ELETRONICO", "ALUMINIO", "PLASTICO_PET", "VIDRO", "PAPELAO"] as const;
export type Material = (typeof MATERIALS)[number];

export type MaterialUnit = "KG" | "L";

// Valores INICIAIS de exemplo. Quem define a tabela real é a Prefeitura (e
// qualquer uso dos EcoCoins fora do app depende de base legal municipal).
export const DEFAULT_RATES: Record<Material, { label: string; unit: MaterialUnit; pointsPerUnit: number }> = {
  OLEO_COZINHA: { label: "Óleo de cozinha", unit: "L", pointsPerUnit: 150 },
  ELETRONICO: { label: "Eletrônicos", unit: "KG", pointsPerUnit: 120 },
  ALUMINIO: { label: "Alumínio", unit: "KG", pointsPerUnit: 100 },
  PLASTICO_PET: { label: "Plástico / PET", unit: "KG", pointsPerUnit: 50 },
  VIDRO: { label: "Vidro", unit: "KG", pointsPerUnit: 30 },
  PAPELAO: { label: "Papelão", unit: "KG", pointsPerUnit: 20 },
};

// Categoria de ponto que precisa aceitar o material para receber a entrega.
export const MATERIAL_CATEGORY: Record<Material, PointCategory> = {
  OLEO_COZINHA: "OLEO",
  ELETRONICO: "ELETRONICO",
  ALUMINIO: "RECICLAVEL",
  PLASTICO_PET: "RECICLAVEL",
  VIDRO: "RECICLAVEL",
  PAPELAO: "RECICLAVEL",
};

export const QR_TTL_SECONDS = 120;
// Depois que o operador confere o código, ele ganha esta janela para pesar e
// confirmar (o código de 120 s expirava no meio da pesagem).
export const CLAIM_WINDOW_SECONDS = 600;
export const MAX_DELIVERY_QUANTITY = 500;

export function isMaterial(v: unknown): v is Material {
  return typeof v === "string" && (MATERIALS as readonly string[]).includes(v);
}

export function pointsFor(quantity: number, pointsPerUnit: number): number {
  return Math.round(quantity * pointsPerUnit);
}

// ---------------------------------------------------------------------------
// Limites de uso (antifraude). Valores SIMULADOS: a Prefeitura define os reais.
// ---------------------------------------------------------------------------

/** Teto diário de EcoCoins por pessoa. */
export const MAX_POINTS_PER_DAY = 3000;
/** Registros novos + confirmações por pessoa por hora. */
export const MAX_ACTIONS_PER_HOUR = 8;
/** Quantos códigos inválidos um operador pode digitar por hora. */
export const MAX_CODE_ATTEMPTS_PER_HOUR = 30;

// ---------------------------------------------------------------------------
// Troca por Moeda Capiba (moeda social digital da Prefeitura do Recife)
// ---------------------------------------------------------------------------

/** Quantos EcoCoins valem 1 Capiba. VALOR DE EXEMPLO: quem define é a Prefeitura. */
export const ECOCOINS_PER_CAPIBA = 100;
/** Teto de Capibas numa única troca. */
export const MAX_CAPIBAS_PER_EXCHANGE = 50;
/** Trocas por pessoa por hora (antifraude). */
export const MAX_EXCHANGES_PER_HOUR = 10;

// Versão do aviso de privacidade. Ao mudar o texto, suba a versão: quem já
// aceitou precisa aceitar de novo (LGPD, art. 8º, §6º).
export const CONSENT_VERSION = "2026-09-21";
