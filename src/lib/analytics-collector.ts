import "server-only";
import { supabaseAdmin } from "./supabase";
import { getActiveInstagramAccount } from "./account";
import { getAccountInfo, getMediaInsights, InstagramApiError } from "./instagram";
import { getBrasiliaDateString, startOfBrasiliaDay } from "./format-date";

const MONITORED_WINDOW_DAYS = 30; // coleta métricas de posts publicados nos últimos N dias

export interface AnalyticsRunSummary {
  skipped?: string;
  collected: number;
  errors: number;
}

/** Coleta métricas (views/likes/comments/shares) de todos os Reels publicados recentemente. */
export async function collectAnalyticsTick(): Promise<AnalyticsRunSummary> {
  const summary: AnalyticsRunSummary = { collected: 0, errors: 0 };

  const account = await getActiveInstagramAccount();
  if (!account) {
    summary.skipped = "Nenhuma conta do Instagram conectada";
    return summary;
  }
  if (account.token_expires_at && new Date(account.token_expires_at) <= new Date()) {
    summary.skipped = "Token do Instagram expirado — renove em Configurações";
    return summary;
  }

  const since = new Date(Date.now() - MONITORED_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: posts, error } = await supabaseAdmin
    .from("posts")
    .select("id, ig_media_id")
    .eq("status", "publicado")
    .not("ig_media_id", "is", null)
    .gte("published_at", since);

  if (error) throw new Error(`Erro ao buscar posts publicados: ${error.message}`);

  for (const post of posts ?? []) {
    try {
      const insights = await getMediaInsights(post.ig_media_id as string, account.access_token);
      await supabaseAdmin.from("analytics").insert({
        post_id: post.id,
        views: insights.views,
        likes: insights.likes,
        comments: insights.comments,
        shares: insights.shares,
      });
      summary.collected++;
    } catch (err) {
      summary.errors++;
      console.error(
        `Erro ao coletar métricas do post ${post.id}:`,
        err instanceof InstagramApiError ? err.message : err
      );
    }
  }

  await updateTodayAccountStats(account.ig_user_id, account.access_token);

  return summary;
}

async function updateTodayAccountStats(igUserId: string, accessToken: string) {
  const info = await getAccountInfo(igUserId, accessToken);

  // Dia civil de Brasília, não UTC — publicações entre 21h e 23h59 em
  // Brasília já seriam "amanhã" em UTC e cairiam no bucket errado.
  const todayStr = getBrasiliaDateString();
  const dayStart = startOfBrasiliaDay(todayStr);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const { data: prevRow } = await supabaseAdmin
    .from("account_stats_daily")
    .select("followers_count")
    .lt("stat_date", todayStr)
    .order("stat_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: todaysPosts } = await supabaseAdmin
    .from("posts")
    .select("id")
    .eq("status", "publicado")
    .gte("published_at", dayStart.toISOString())
    .lt("published_at", dayEnd.toISOString());

  let totalViews = 0;
  let totalLikes = 0;
  let totalComments = 0;

  for (const post of todaysPosts ?? []) {
    const { data: latest } = await supabaseAdmin
      .from("analytics")
      .select("views, likes, comments")
      .eq("post_id", post.id)
      .order("collected_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest) {
      totalViews += latest.views ?? 0;
      totalLikes += latest.likes ?? 0;
      totalComments += latest.comments ?? 0;
    }
  }

  await supabaseAdmin.from("account_stats_daily").upsert(
    {
      stat_date: todayStr,
      followers_count: info.followersCount,
      followers_gained:
        prevRow?.followers_count != null ? info.followersCount - prevRow.followers_count : null,
      posts_count: todaysPosts?.length ?? 0,
      total_views: totalViews,
      total_likes: totalLikes,
      total_comments: totalComments,
      collected_at: new Date().toISOString(),
    },
    { onConflict: "stat_date" }
  );
}
