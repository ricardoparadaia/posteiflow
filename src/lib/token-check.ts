import "server-only";
import { getActiveInstagramAccount } from "./account";
import { sendTelegramAlert } from "./telegram";

const ALERT_THRESHOLD_DAYS = 7;

export interface TokenCheckResult {
  skipped?: string;
  daysLeft?: number;
  alerted: boolean;
  expired: boolean;
}

/** Checa a expiração do token de longa duração e dispara alerta no Telegram (se configurado). */
export async function checkTokenExpiryAndAlert(): Promise<TokenCheckResult> {
  const account = await getActiveInstagramAccount();
  if (!account || !account.token_expires_at) {
    return { skipped: "Nenhuma conta conectada ou sem data de expiração registrada", alerted: false, expired: false };
  }

  const expiresAt = new Date(account.token_expires_at);
  const daysLeft = (expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);

  if (daysLeft <= 0) {
    await sendTelegramAlert(
      `🔴 <b>PosteiFlow</b>: o token do Instagram (@${account.username ?? account.ig_user_id}) EXPIROU em ${expiresAt.toLocaleString("pt-BR")}. Publicações vão falhar até você renovar em Configurações.`
    );
    return { daysLeft, alerted: true, expired: true };
  }

  if (daysLeft <= ALERT_THRESHOLD_DAYS) {
    await sendTelegramAlert(
      `⚠️ <b>PosteiFlow</b>: o token do Instagram (@${account.username ?? account.ig_user_id}) expira em ${Math.ceil(daysLeft)} dia(s), em ${expiresAt.toLocaleString("pt-BR")}. Renove em Configurações antes que expire.`
    );
    return { daysLeft, alerted: true, expired: false };
  }

  return { daysLeft, alerted: false, expired: false };
}
