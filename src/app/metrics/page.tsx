import { MetricsView, type DailyStat, type ReelRow } from "@/components/app/metrics-view";
import { supabaseAdmin } from "@/lib/supabase";
import { getLatestAnalyticsMap, type LatestAnalytics } from "@/lib/metrics";
import type { Post, Video } from "@/types/db";

export const dynamic = "force-dynamic";

const DAILY_STATS_WINDOW_DAYS = 30;
const PERFORMANCE_MIN_HISTORY = 5;

type PostWithVideo = Post & { video: Video };

const PERF_ALTO = { label: "Alto", bg: "#DCFCE7", color: "#16A34A" };
const PERF_MEDIO = { label: "Médio", bg: "#FEF3C7", color: "#D97706" };
const PERF_BAIXO = { label: "Baixo", bg: "#FEE2E2", color: "#DC2626" };
const PERF_INSUF = { label: "Histórico insuficiente", bg: "#F1F0F8", color: "#8B88A3" };

/** Tercil de views dentro do histórico COMPLETO de posts publicados da conta — não do período selecionado na tela, pra o badge continuar comparável mesmo trocando de período. Menos de 5 posts publicados no total: sem base estatística, mostra "Histórico insuficiente" pra todos. */
function computePerformanceTiers(posts: { id: string; views: number }[]): Map<string, typeof PERF_ALTO> {
  const tiers = new Map<string, typeof PERF_ALTO>();
  if (posts.length < PERFORMANCE_MIN_HISTORY) {
    for (const p of posts) tiers.set(p.id, PERF_INSUF);
    return tiers;
  }
  const sortedIds = [...posts].sort((a, b) => a.views - b.views).map((p) => p.id);
  const n = sortedIds.length;
  sortedIds.forEach((id, i) => {
    const frac = i / n;
    tiers.set(id, frac < 1 / 3 ? PERF_BAIXO : frac < 2 / 3 ? PERF_MEDIO : PERF_ALTO);
  });
  return tiers;
}

async function getReelRows(): Promise<ReelRow[]> {
  const { data, error } = await supabaseAdmin
    .from("posts")
    .select("*, video:videos(*)")
    .eq("status", "publicado")
    .order("published_at", { ascending: false });

  if (error) throw new Error(error.message);

  const posts = (data ?? []) as PostWithVideo[];
  const analytics = await getLatestAnalyticsMap();

  const withViews = posts.map((post) => ({
    id: post.id,
    views: analytics.get(post.id)?.views ?? 0,
  }));
  const tiers = computePerformanceTiers(withViews);

  return posts.map((post) => {
    const m: LatestAnalytics | undefined = analytics.get(post.id);
    const views = m?.views ?? 0;
    const likes = m?.likes ?? 0;
    const comments = m?.comments ?? 0;
    const shares = m?.shares ?? 0;
    const reach = m?.reach ?? 0;
    const saved = m?.saved ?? 0;
    const engagementPct = views > 0 ? ((likes + comments + shares + saved) / views) * 100 : 0;

    return {
      id: post.id,
      filename: post.video.filename,
      caption: post.video.caption ?? post.video.filename,
      publishedAt: post.published_at ?? post.scheduled_datetime,
      views,
      reach,
      likes,
      comments,
      shares,
      saved,
      engagementPct,
      perf: tiers.get(post.id) ?? PERF_INSUF,
    };
  });
}

async function getDailyStats(): Promise<DailyStat[]> {
  const { data, error } = await supabaseAdmin
    .from("account_stats_daily")
    .select("*")
    .order("stat_date", { ascending: false })
    .limit(DAILY_STATS_WINDOW_DAYS);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((row) => ({
      date: row.stat_date,
      followersCount: row.followers_count,
      followersGained: row.followers_gained,
      postsCount: row.posts_count,
      totalViews: row.total_views,
      totalLikes: row.total_likes,
      totalComments: row.total_comments,
      totalReach: row.total_reach,
      totalSaves: row.total_saves,
    }))
    .reverse();
}

export default async function MetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [reelRows, dailyStats, { tab }] = await Promise.all([getReelRows(), getDailyStats(), searchParams]);
  const initialTab = tab === "resumo" ? "resumo" : "reels";

  return <MetricsView reelRows={reelRows} dailyStats={dailyStats} initialTab={initialTab} />;
}
