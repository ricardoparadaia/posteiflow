import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  exchangeForLongLivedToken,
  refreshLongLivedToken,
  getAccountInfo,
  InstagramApiError,
} from "@/lib/instagram";
import type { TokenSource } from "@/types/db";

export const dynamic = "force-dynamic";

const FALLBACK_EXPIRES_IN_DAYS = 60;

/**
 * Erro específico da Meta quando o token passado para ig_exchange_token não
 * é do tipo esperado por esse endpoint (ex: já é um token long-lived emitido
 * pelo fluxo "Instagram API with Instagram Login", em vez de um short-lived
 * clássico). Confirmado empiricamente: o mesmo erro aparece com dois pares
 * de app_id/app_secret diferentes (um errado, um correto), então não é uma
 * questão de credencial — é o tipo de token mesmo.
 */
function isNonExchangeableTokenTypeError(err: unknown): boolean {
  return err instanceof InstagramApiError && err.code === 452 && err.errorSubcode === 2207055;
}

interface ResolvedToken {
  workingToken: string;
  expiresAt: Date;
  tokenSource: TokenSource;
}

/**
 * Resolve qual token usar e sua expiração, tentando nesta ordem:
 * 1. ig_exchange_token (fluxo oficial curto -> longo, expiração real)
 * 2. ig_refresh_token direto no token recebido (só funciona se ele já for
 *    long-lived; expiração real) — só tentado se (1) falhar especificamente
 *    por tipo de token inválido
 * 3. usa o token como está, com expiração estimada — último recurso
 *
 * Qualquer falha em (1) que NÃO seja o erro de tipo de token propaga direto
 * (aborta a conexão) em vez de cair silenciosamente no fallback.
 */
async function resolveWorkingToken(
  providedToken: string,
  appSecret: string
): Promise<ResolvedToken> {
  const now = new Date();

  try {
    const { access_token, expires_in } = await exchangeForLongLivedToken(providedToken, appSecret);
    return {
      workingToken: access_token,
      expiresAt: new Date(now.getTime() + expires_in * 1000),
      tokenSource: "exchanged",
    };
  } catch (exchangeErr) {
    if (!isNonExchangeableTokenTypeError(exchangeErr)) {
      throw exchangeErr;
    }
  }

  try {
    const { access_token, expires_in } = await refreshLongLivedToken(providedToken);
    return {
      workingToken: access_token,
      expiresAt: new Date(now.getTime() + expires_in * 1000),
      tokenSource: "refreshed_direct",
    };
  } catch {
    console.warn(
      `[instagram/connect] Nem exchange nem refresh direto funcionaram — usando o token como está, expiração estimada em ${FALLBACK_EXPIRES_IN_DAYS} dias`
    );
    return {
      workingToken: providedToken,
      expiresAt: new Date(now.getTime() + FALLBACK_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000),
      tokenSource: "fallback_unverified",
    };
  }
}

/**
 * Conecta (ou reconecta) a conta do Instagram a partir do IG_ACCESS_TOKEN do
 * .env. Valida o token primeiro (bloqueia se ele não funcionar de verdade),
 * depois resolve a melhor forma de obter uma expiração real (veja
 * resolveWorkingToken) e salva em instagram_accounts.
 */
export async function POST() {
  const appSecret = process.env.IG_APP_SECRET;
  const providedToken = process.env.IG_ACCESS_TOKEN;
  const igUserId = process.env.IG_USER_ID;

  if (!appSecret || !providedToken || !igUserId) {
    return NextResponse.json(
      { error: "IG_APP_SECRET, IG_ACCESS_TOKEN e IG_USER_ID precisam estar definidos no .env" },
      { status: 400 }
    );
  }

  try {
    // Passo 1: bloqueia aqui se o token não for válido de verdade.
    await getAccountInfo(igUserId, providedToken);

    // Passos 2-4: troca -> refresh direto -> fallback estimado.
    const { workingToken, expiresAt, tokenSource } = await resolveWorkingToken(providedToken, appSecret);

    const info = await getAccountInfo(igUserId, workingToken);
    const now = new Date();

    const { data, error } = await supabaseAdmin
      .from("instagram_accounts")
      .upsert(
        {
          ig_user_id: igUserId,
          username: info.username,
          access_token: workingToken,
          token_expires_at: expiresAt.toISOString(),
          token_last_refreshed_at: now.toISOString(),
          token_source: tokenSource,
        },
        { onConflict: "ig_user_id" }
      )
      .select()
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, tokenSource, account: maskAccount(data) });
  } catch (err) {
    const message =
      err instanceof InstagramApiError
        ? `Instagram API: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

function maskAccount<T extends { access_token: string }>(account: T) {
  return { ...account, access_token: maskToken(account.access_token) };
}

function maskToken(token: string) {
  if (token.length <= 8) return "••••••••";
  return `${token.slice(0, 4)}${"•".repeat(12)}${token.slice(-4)}`;
}
