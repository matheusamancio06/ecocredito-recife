const TIME_ZONE = "America/Recife";

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: TIME_ZONE });
const dateOnly = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: TIME_ZONE });

export const formatDateTime = (date: Date): string => dateTime.format(date);
export const formatDate = (date: Date): string => dateOnly.format(date);

export function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

const DAY_MS = 86_400_000;

/** Há quanto tempo algo aconteceu, em dias corridos: "hoje", "há 1 dia", "há 12 dias". */
export function formatAge(since: Date, now = new Date()): string {
  const days = Math.floor((now.getTime() - since.getTime()) / DAY_MS);
  if (days <= 0) return "hoje";
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}
