import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveInstagramAccount } from "@/lib/account";
import { refreshLongLivedToken, InstagramApiError } from "@/lib/instagram";

export const dynamic = "force-dynamic";

/**
 * Renova o token de longa duração já salvo em instagram_accounts.
 * Só funciona se o token tiver pelo menos 24h desde a última emissão/renovação
 * e ainda não tiver expirado — a API do Instagram rejeita a renovação fora
 * dessa janela (nesse caso, use /api/instagram/connect com um token curto novo).
 */
export async function POST() {
  const account = await getActiveInstagramAccount();
  if (!account) {
    return NextResponse.json({ error: "Nenhuma conta do Instagram conectada" }, { status: 400 });
  }

  try {
    const { access_token, expires_in } = await refreshLongLivedToken(account.access_token);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + expires_in * 1000);

    const { data, error } = await supabaseAdmin
      .from("instagram_accounts")
      .update({
        access_token,
        token_expires_at: expiresAt.toISOString(),
        token_last_refreshed_at: now.toISOString(),
        token_source: "refreshed_direct",
      })
      .eq("id", account.id)
      .select()
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, token_expires_at: data.token_expires_at });
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
