import "server-only";
import { supabaseAdmin } from "./supabase";

export interface LatestAnalytics {
  post_id: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  saved: number;
  collected_at: string;
}

/** Mapa post_id -> snapshot de métricas mais recente. */
export async function getLatestAnalyticsMap(): Promise<Map<string, LatestAnalytics>> {
  const { data, error } = await supabaseAdmin
    .from("analytics")
    .select("post_id, views, likes, comments, shares, reach, saved, collected_at")
    .order("collected_at", { ascending: false });

  if (error) throw new Error(error.message);

  const map = new Map<string, LatestAnalytics>();
  for (const row of data ?? []) {
    if (!map.has(row.post_id)) map.set(row.post_id, row as LatestAnalytics);
  }
  return map;
}

export function sumMetrics(entries: Iterable<LatestAnalytics>) {
  const totals = { views: 0, likes: 0, comments: 0, shares: 0, reach: 0, saved: 0 };
  for (const entry of entries) {
    totals.views += entry.views ?? 0;
    totals.likes += entry.likes ?? 0;
    totals.comments += entry.comments ?? 0;
    totals.shares += entry.shares ?? 0;
    totals.reach += entry.reach ?? 0;
    totals.saved += entry.saved ?? 0;
  }
  return totals;
}
