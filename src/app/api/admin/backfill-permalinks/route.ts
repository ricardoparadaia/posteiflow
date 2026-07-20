import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveInstagramAccount } from "@/lib/account";
import { getMediaPermalink, InstagramApiError } from "@/lib/instagram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Rota de manutenção one-shot: preenche o permalink dos posts publicados
 * antes da coluna existir. Idempotente (só olha permalink is null), então
 * pode ser rodada mais de uma vez sem risco — protegida pela sessão do
 * Supabase Auth (proxy.ts), não precisa de segredo extra.
 */
export async function POST() {
  const account = await getActiveInstagramAccount();
  if (!account) {
    return NextResponse.json({ error: "Nenhuma conta do Instagram conectada" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("posts")
    .select("id, ig_media_id")
    .eq("status", "publicado")
    .is("permalink", null)
    .not("ig_media_id", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const posts = (data ?? []) as { id: string; ig_media_id: string }[];
  let updated = 0;
  const failures: { id: string; error: string }[] = [];

  for (const post of posts) {
    try {
      const permalink = await getMediaPermalink(post.ig_media_id, account.access_token);
      if (permalink) {
        await supabaseAdmin.from("posts").update({ permalink }).eq("id", post.id);
        updated++;
      } else {
        failures.push({ id: post.id, error: "API não retornou permalink" });
      }
    } catch (err) {
      failures.push({
        id: post.id,
        error: err instanceof InstagramApiError ? `${err.message} (status ${err.status})` : String(err),
      });
    }
  }

  return NextResponse.json({ ok: true, totalCandidates: posts.length, updated, failures });
}

export async function GET() {
  return POST();
}
