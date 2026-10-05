import crypto from "node:crypto";
import type { Role } from "./domain";

/**
 * Identidade devolvida por um provedor de login (gov.br em produção).
 * O restante do sistema só conhece este formato: trocar o provedor simulado
 * pelo Login Único real não exige mexer em nenhuma outra parte.
 */
export interface GovIdentity {
  sub: string;
  cpf: string;
  name: string;
}

export interface RoleAssignment {
  role: Role;
  pointId?: string | null;
}

// Chave própria do hash de CPF, separada do segredo de sessão: trocar o segredo
// de sessão (rotina de segurança) não pode mudar a identidade de ninguém, senão
// cada pessoa viraria um usuário novo e perderia o saldo de EcoCoins.
function getIdentityPepper(): string {
  const pepper = process.env.IDENTITY_PEPPER;
  if (pepper) return pepper;
  if (process.env.NODE_ENV === "production") {
    throw new Error("IDENTITY_PEPPER não definido. Defina um valor fixo e nunca o altere.");
  }
  return "dev-only-pepper-identidade";
}

// Nunca guardamos o CPF em claro: só um HMAC com essa chave.
export function hashCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, "");
  return crypto.createHmac("sha256", getIdentityPepper()).update(`cpf:${digits}`).digest("hex");
}

export interface Persona extends GovIdentity {
  id: string;
  role: Role;
  // Para operadores: tipo de ponto (com atendente) onde trabalham.
  pointKind?: "COOPERATIVA" | "ECOESTACAO";
  blurb: string;
}

// Personagens FICTÍCIOS do modo demonstração (CPFs inexistentes).
// Representam o que o gov.br devolveria após o login.
export const PERSONAS: Persona[] = [
  {
    id: "cidadao-ana",
    sub: "sim-cidadao-ana",
    cpf: "000.000.000-11",
    name: "Ana Beatriz Souza",
    role: "CIDADAO",
    blurb: "Moradora: registra entulho jogado na rua e recicla para acumular EcoCoins.",
  },
  {
    id: "cidadao-roberto",
    sub: "sim-cidadao-roberto",
    cpf: "000.000.000-12",
    name: "Roberto Nascimento",
    role: "CIDADAO",
    blurb: "Morador: confirma o registro de um vizinho no mesmo ponto.",
  },
  {
    id: "gestora",
    sub: "sim-gestora",
    cpf: "000.000.000-01",
    name: "Marina Albuquerque",
    role: "GESTOR",
    blurb: "Gestão de coleta: vê os registros abertos e dá baixa quando remove.",
  },
  {
    id: "operador-cooperativa",
    sub: "sim-oper-cooperativa",
    cpf: "000.000.000-04",
    name: "Paulo Ribeiro",
    role: "OPERADOR",
    pointKind: "COOPERATIVA",
    blurb: "Operador de cooperativa: pesa recicláveis e credita EcoCoins.",
  },
  {
    id: "operador-ecoestacao",
    sub: "sim-oper-ecoestacao",
    cpf: "000.000.000-05",
    name: "Sônia Barros",
    role: "OPERADOR",
    pointKind: "ECOESTACAO",
    blurb: "Atendente de ecoestação: confere entregas e credita EcoCoins.",
  },
];

export function getPersona(id: string): Persona | undefined {
  return PERSONAS.find((p) => p.id === id);
}

// Cidadãos extras usados só para popular os dados simulados.
export const SEED_CITIZENS: GovIdentity[] = [
  { sub: "sim-cidadao-lucia", cpf: "000.000.000-13", name: "Lúcia Ferreira" },
  { sub: "sim-cidadao-paulo", cpf: "000.000.000-14", name: "Paulo Henrique Alves" },
  { sub: "sim-cidadao-marta", cpf: "000.000.000-15", name: "Marta Cavalcanti" },
  { sub: "sim-cidadao-igor", cpf: "000.000.000-16", name: "Igor Tavares" },
];
