import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { ptBR } from "date-fns/locale";

// Fixo em Brasília — uso pessoal de uma conta brasileira, sem necessidade de
// suportar múltiplos fusos.
const TIMEZONE = "America/Sao_Paulo";

/**
 * Formata um timestamptz (string ISO ou Date) no horário de Brasília. Use
 * isto em vez de date-fns `format()` direto sempre que exibir
 * scheduled_datetime/published_at/qualquer timestamptz na tela: `format()`
 * sozinho usa o timezone do runtime (UTC na Vercel), não o de Brasília, e
 * mostra a hora errada mesmo com o dado salvo certo no banco.
 */
export function formatBrasilia(date: string | Date, pattern: string): string {
  return formatInTimeZone(date, TIMEZONE, pattern, { locale: ptBR });
}

/**
 * Data civil (yyyy-MM-dd) em Brasília para um instante — use para calcular
 * "hoje" e para bucketing por dia (ex: account_stats_daily.stat_date).
 * `new Date().toISOString().slice(0, 10)` dá o dia civil em UTC, que é 3h
 * adiantado em relação a Brasília — publicações entre 21h e 23h59 caem no
 * dia civil errado se usar UTC.
 */
export function getBrasiliaDateString(date: Date | number = new Date()): string {
  return formatInTimeZone(date, TIMEZONE, "yyyy-MM-dd");
}

/** Início (00:00) do dia civil de Brasília para uma data "yyyy-MM-dd", como instante UTC. */
export function startOfBrasiliaDay(dateString: string): Date {
  return fromZonedTime(`${dateString} 00:00:00`, TIMEZONE);
}
