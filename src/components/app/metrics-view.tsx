"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Eye,
  Heart,
  Search,
  Share2,
  Video as VideoIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/app/stat-card";
import { FollowersGainChart, type FollowersGainPoint } from "@/components/app/followers-gain-chart";
import { PerformanceBarChart, type PerformancePoint } from "@/components/app/performance-bar-chart";
import { formatBrasilia } from "@/lib/format-date";
import { cn } from "@/lib/utils";

const PERIODS = [7, 14, 30] as const;
type Period = (typeof PERIODS)[number];
const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 25;

export interface ReelRow {
  id: string;
  filename: string;
  caption: string;
  thumbnailUrl: string | null;
  permalink: string | null;
  publishedAt: string; // ISO
  views: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saved: number;
  engagementPct: number;
  perf: { label: string; bg: string; color: string };
}

export interface DailyStat {
  date: string; // yyyy-MM-dd
  followersCount: number | null;
  followersGained: number | null;
  postsCount: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalReach: number;
  totalSaves: number;
}

type SortKey = "date" | "views" | "engagement";

function sumReels(rows: ReelRow[]) {
  const totals = { views: 0, likes: 0, comments: 0, shares: 0, reach: 0, saved: 0 };
  for (const r of rows) {
    totals.views += r.views;
    totals.likes += r.likes;
    totals.comments += r.comments;
    totals.shares += r.shares;
    totals.reach += r.reach;
    totals.saved += r.saved;
  }
  return totals;
}

function pctDelta(curr: number, prev: number): number | null {
  if (prev <= 0) return null;
  return ((curr - prev) / prev) * 100;
}

function formatDelta(value: number | null, unit: "%" | "p.p." = "%", decimals = 1): { text: string; positive: boolean } | null {
  if (value == null || !Number.isFinite(value)) return null;
  const sign = value >= 0 ? "+" : "";
  return { text: `${sign}${value.toFixed(decimals).replace(".", ",")} ${unit} vs. período anterior`, positive: value >= 0 };
}

export function MetricsView({
  reelRows,
  dailyStats,
  initialTab,
}: {
  reelRows: ReelRow[];
  dailyStats: DailyStat[];
  initialTab: "reels" | "resumo";
}) {
  const [now] = useState(() => Date.now());
  const [period, setPeriod] = useState<Period>(7);
  const [tab, setTab] = useState<"reels" | "resumo">(initialTab);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [page, setPage] = useState(1);

  const cutoffCurrent = now - period * DAY_MS;
  const cutoffPrevious = now - period * 2 * DAY_MS;

  const currentPosts = useMemo(
    () => reelRows.filter((r) => new Date(r.publishedAt).getTime() >= cutoffCurrent),
    [reelRows, cutoffCurrent]
  );
  const previousPosts = useMemo(
    () =>
      reelRows.filter((r) => {
        const t = new Date(r.publishedAt).getTime();
        return t >= cutoffPrevious && t < cutoffCurrent;
      }),
    [reelRows, cutoffPrevious, cutoffCurrent]
  );

  const currentTotals = useMemo(() => sumReels(currentPosts), [currentPosts]);
  const previousTotals = useMemo(() => sumReels(previousPosts), [previousPosts]);

  const currentEngagementRate =
    currentTotals.views > 0
      ? ((currentTotals.likes + currentTotals.comments + currentTotals.shares + currentTotals.saved) / currentTotals.views) * 100
      : null;
  const previousEngagementRate =
    previousTotals.views > 0
      ? ((previousTotals.likes + previousTotals.comments + previousTotals.shares + previousTotals.saved) / previousTotals.views) * 100
      : null;
  const engagementDeltaPP =
    currentEngagementRate != null && previousEngagementRate != null ? currentEngagementRate - previousEngagementRate : null;

  const avgViewsPerReel = currentPosts.length > 0 ? currentTotals.views / currentPosts.length : null;
  const avgReachPerReel = currentPosts.length > 0 ? currentTotals.reach / currentPosts.length : null;
  const prevAvgViewsPerReel = previousPosts.length > 0 ? previousTotals.views / previousPosts.length : null;
  const prevAvgReachPerReel = previousPosts.length > 0 ? previousTotals.reach / previousPosts.length : null;

  const shareRate = currentTotals.views > 0 ? (currentTotals.shares / currentTotals.views) * 100 : null;
  const prevShareRate = previousTotals.views > 0 ? (previousTotals.shares / previousTotals.views) * 100 : null;

  const bestReel = useMemo(
    () => (currentPosts.length === 0 ? null : [...currentPosts].sort((a, b) => b.views - a.views)[0]),
    [currentPosts]
  );
  const topPerformers = useMemo(() => [...currentPosts].sort((a, b) => b.views - a.views).slice(0, 3), [currentPosts]);

  const perfChartData: PerformancePoint[] = useMemo(
    () => dailyStats.slice(-period).map((d) => ({ date: d.date, views: d.totalViews, reach: d.totalReach })),
    [dailyStats, period]
  );

  const followersGainSeries: FollowersGainPoint[] = useMemo(() => {
    const withGain = dailyStats.filter((d) => d.followersGained != null);
    return withGain.map((row, index) => {
      const prev = withGain[index - 1];
      let sinceDate: string | null = null;
      if (prev) {
        const gapDays =
          (new Date(`${row.date}T00:00:00`).getTime() - new Date(`${prev.date}T00:00:00`).getTime()) / DAY_MS;
        if (gapDays > 1) sinceDate = prev.date;
      }
      return { date: row.date, gained: row.followersGained as number, sinceDate };
    });
  }, [dailyStats]);

  const filteredReels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q ? currentPosts.filter((r) => r.caption.toLowerCase().includes(q)) : currentPosts;
    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === "views") return b.views - a.views;
      if (sortKey === "engagement") return b.engagementPct - a.engagementPct;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });
    return sorted;
  }, [currentPosts, searchQuery, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filteredReels.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const pagedReels = filteredReels.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  function updateSearch(value: string) {
    setSearchQuery(value);
    setPage(1);
  }
  function updateSortKey(value: SortKey) {
    setSortKey(value);
    setPage(1);
  }
  function updatePeriod(value: Period) {
    setPeriod(value);
    setPage(1);
  }

  const viewsDelta = formatDelta(pctDelta(currentTotals.views, previousTotals.views));
  const sharesDelta = formatDelta(pctDelta(currentTotals.shares, previousTotals.shares));
  const savedDelta = formatDelta(pctDelta(currentTotals.saved, previousTotals.saved));
  const engagementDelta = formatDelta(engagementDeltaPP, "p.p.");
  const avgReachDelta = formatDelta(avgReachPerReel != null && prevAvgReachPerReel != null ? pctDelta(avgReachPerReel, prevAvgReachPerReel) : null);
  const avgViewsDelta = formatDelta(avgViewsPerReel != null && prevAvgViewsPerReel != null ? pctDelta(avgViewsPerReel, prevAvgViewsPerReel) : null);
  const shareRateDelta = formatDelta(
    shareRate != null && prevShareRate != null ? shareRate - prevShareRate : null,
    "p.p."
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight sm:text-[26px]">Métricas</h1>
          <p className="mt-1 text-sm text-[#75718F]">
            Acompanhe o desempenho dos Reels publicados e identifique o que mais gera alcance e engajamento
          </p>
        </div>
        <div className="flex shrink-0 gap-0.5 self-start rounded-[10px] bg-[#F6F5FC] p-[3px]">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => updatePeriod(p)}
              className={cn(
                "rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors",
                period === p ? "bg-card text-primary shadow-sm" : "text-[#8B88A3]"
              )}
            >
              {p} dias
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Total de views"
          value={currentTotals.views.toLocaleString("pt-BR")}
          icon={Eye}
          accent="sky"
          hint={viewsDelta?.text}
          hintClassName={viewsDelta ? (viewsDelta.positive ? "text-[#16A34A]" : "text-[#DC2626]") : undefined}
        />
        <StatCard
          label="Engajamento médio"
          value={currentEngagementRate != null ? `${currentEngagementRate.toFixed(2).replace(".", ",")}%` : "—"}
          icon={Heart}
          accent="amber"
          hint={engagementDelta?.text}
          hintClassName={engagementDelta ? (engagementDelta.positive ? "text-[#16A34A]" : "text-[#DC2626]") : undefined}
        />
        <StatCard
          label="Compartilhamentos"
          value={currentTotals.shares.toLocaleString("pt-BR")}
          icon={Share2}
          accent="violet"
          hint={sharesDelta?.text}
          hintClassName={sharesDelta ? (sharesDelta.positive ? "text-[#16A34A]" : "text-[#DC2626]") : undefined}
        />
        <StatCard
          label="Salvamentos"
          value={currentTotals.saved.toLocaleString("pt-BR")}
          icon={Bookmark}
          accent="emerald"
          hint={savedDelta?.text}
          hintClassName={savedDelta ? (savedDelta.positive ? "text-[#16A34A]" : "text-[#DC2626]") : undefined}
        />

        <Card className="p-5">
          <p className="text-[13px] font-medium text-[#75718F]">Melhor Reel do período</p>
          {bestReel ? (
            <>
              <div className="mt-2.5 flex items-center gap-2.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-muted text-[#B4B1C9]">
                  <VideoIcon className="h-4 w-4" />
                </div>
                <p className="line-clamp-2 min-w-0 text-[13px] font-semibold">{bestReel.caption}</p>
              </div>
              <p className="mt-2.5 flex items-center gap-1.5 text-[13px] font-bold text-[#7C5CFC]">
                <Eye className="h-3.5 w-3.5" />
                {bestReel.views.toLocaleString("pt-BR")} views
              </p>
            </>
          ) : (
            <p className="mt-2.5 text-sm text-muted-foreground">Sem posts no período.</p>
          )}
        </Card>
      </div>

      <Card className="p-[22px]">
        <p className="mb-4 text-base font-bold">Insights do período</p>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Taxa de engajamento</p>
            <p className="text-xl font-extrabold">{currentEngagementRate != null ? `${currentEngagementRate.toFixed(2).replace(".", ",")}%` : "—"}</p>
            {engagementDelta ? <p className="mt-1 text-xs font-semibold text-[#16A34A]">{engagementDelta.text.split(" vs.")[0]}</p> : null}
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Alcance médio por Reel</p>
            <p className="text-xl font-extrabold">{avgReachPerReel != null ? Math.round(avgReachPerReel).toLocaleString("pt-BR") : "—"}</p>
            {avgReachDelta ? <p className="mt-1 text-xs font-semibold text-[#16A34A]">{avgReachDelta.text.split(" vs.")[0]}</p> : null}
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Views médias por Reel</p>
            <p className="text-xl font-extrabold">{avgViewsPerReel != null ? Math.round(avgViewsPerReel).toLocaleString("pt-BR") : "—"}</p>
            {avgViewsDelta ? <p className="mt-1 text-xs font-semibold text-[#16A34A]">{avgViewsDelta.text.split(" vs.")[0]}</p> : null}
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Taxa de compartilhamento</p>
            <p className="text-xl font-extrabold">{shareRate != null ? `${shareRate.toFixed(2).replace(".", ",")}%` : "—"}</p>
            {shareRateDelta ? <p className="mt-1 text-xs font-semibold text-[#16A34A]">{shareRateDelta.text.split(" vs.")[0]}</p> : null}
          </div>
        </div>
        <p className="mt-3 text-[11px] text-[#B4B1C9]">vs. o período de mesmo tamanho imediatamente anterior</p>
      </Card>

      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
        <Card className="flex flex-col p-[22px]">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-base font-bold">Desempenho por dia</p>
            <div className="flex gap-3.5 text-xs text-[#5B5876]">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-[#6D4CFB]" />
                Views
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-[#D8CFFB]" />
                Alcance
              </span>
            </div>
          </div>
          <div className="mt-2 flex-1">
            <PerformanceBarChart data={perfChartData} />
          </div>
        </Card>

        <Card className="flex flex-col p-[22px]">
          <p className="mb-1.5 text-base font-bold">Seguidores ganhos por dia</p>
          <div className="mt-2 flex-1">
            <FollowersGainChart data={followersGainSeries} />
          </div>
        </Card>

        <Card className="p-[22px]">
          <p className="mb-3.5 text-base font-bold">Top performers do período</p>
          {topPerformers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem posts no período.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-[#F1F0F8]">
              {topPerformers.map((post, index) => {
                const thumb = (
                  <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-muted text-[#B4B1C9]">
                    {post.thumbnailUrl ? (
                      <Image src={post.thumbnailUrl} alt="" fill className="object-cover" unoptimized />
                    ) : (
                      <VideoIcon className="h-4 w-4" />
                    )}
                  </div>
                );
                const caption = (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold">{post.caption}</p>
                    <p className="mt-0.5 text-[11px] text-[#8B88A3]">{formatBrasilia(post.publishedAt, "dd MMM · HH:mm")}</p>
                  </div>
                );
                return (
                <li key={post.id} className="flex items-center gap-2.5 py-2.5">
                  <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-foreground">
                    {index + 1}
                  </span>
                  {post.permalink ? (
                    <a
                      href={post.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-w-0 flex-1 items-center gap-2.5 hover:opacity-80"
                    >
                      {thumb}
                      {caption}
                    </a>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      {thumb}
                      {caption}
                    </div>
                  )}
                  <div className="shrink-0 text-right">
                    <p className="text-[13px] font-bold">{post.views.toLocaleString("pt-BR")}</p>
                    <p className="text-[10.5px] text-[#8B88A3]">views</p>
                  </div>
                </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("reels")}
          className={cn(
            "rounded-[10px] px-4 py-2.5 text-[13px] font-semibold transition-colors",
            tab === "reels" ? "bg-accent text-primary" : "bg-[#F6F5FC] text-[#5B5876]"
          )}
        >
          Reels do período
        </button>
        <button
          type="button"
          onClick={() => setTab("resumo")}
          className={cn(
            "rounded-[10px] px-4 py-2.5 text-[13px] font-semibold transition-colors",
            tab === "resumo" ? "bg-accent text-primary" : "bg-[#F6F5FC] text-[#5B5876]"
          )}
        >
          Resumo diário
        </button>
      </div>

      {tab === "reels" ? (
        <Card className="p-[22px]">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex min-w-[220px] max-w-[340px] flex-1 items-center gap-2 rounded-[10px] border border-border bg-[#FBFBFE] px-3 py-2.5">
              <Search className="h-4 w-4 shrink-0 text-[#B4B1C9]" />
              <input
                value={searchQuery}
                onChange={(e) => updateSearch(e.target.value)}
                placeholder="Buscar por título ou palavra-chave..."
                className="w-full border-none bg-transparent text-[13px] outline-none placeholder:text-[#B4B1C9]"
              />
            </div>
            <label className="flex shrink-0 items-center gap-1.5 rounded-[10px] border border-border px-3 py-2 text-[12.5px] text-[#5B5876]">
              Ordenar por
              <select
                value={sortKey}
                onChange={(e) => updateSortKey(e.target.value as SortKey)}
                className="bg-transparent text-[12.5px] font-semibold text-foreground outline-none"
              >
                <option value="date">Publicado em</option>
                <option value="views">Views</option>
                <option value="engagement">Engajamento</option>
              </select>
            </label>
          </div>

          {pagedReels.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum Reel encontrado nesse período.</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex min-w-[960px] flex-col">
                <div className="grid grid-cols-[2.2fr_1fr_0.9fr_0.9fr_0.8fr_0.8fr_1fr_1fr_1fr_1fr] gap-2.5 border-b border-border px-2 pb-2.5 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                  <div>Reel / Vídeo</div>
                  <div>Publicado em</div>
                  <div>Views</div>
                  <div>Alcance</div>
                  <div>Likes</div>
                  <div>Coment.</div>
                  <div>Compart.</div>
                  <div>Salvam.</div>
                  <div>Engaj. %</div>
                  <div>Perf.</div>
                </div>
                {pagedReels.map((row) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-[2.2fr_1fr_0.9fr_0.9fr_0.8fr_0.8fr_1fr_1fr_1fr_1fr] items-center gap-2.5 border-b border-[#F1F0F8] px-2 py-3"
                  >
                    {row.permalink ? (
                      <a
                        href={row.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-w-0 items-center gap-2.5 hover:opacity-80"
                      >
                        <div className="relative flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-muted text-[#B4B1C9]">
                          {row.thumbnailUrl ? (
                            <Image src={row.thumbnailUrl} alt="" fill className="object-cover" unoptimized />
                          ) : (
                            <VideoIcon className="h-4 w-4" />
                          )}
                        </div>
                        <p className="truncate text-[13px] font-semibold">{row.caption}</p>
                      </a>
                    ) : (
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="relative flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-muted text-[#B4B1C9]">
                          {row.thumbnailUrl ? (
                            <Image src={row.thumbnailUrl} alt="" fill className="object-cover" unoptimized />
                          ) : (
                            <VideoIcon className="h-4 w-4" />
                          )}
                        </div>
                        <p className="truncate text-[13px] font-semibold">{row.caption}</p>
                      </div>
                    )}
                    <p className="text-[12.5px] text-[#5B5876]">{formatBrasilia(row.publishedAt, "dd MMM HH:mm")}</p>
                    <p className="text-[12.5px] font-semibold">{row.views.toLocaleString("pt-BR")}</p>
                    <p className="text-[12.5px] text-[#5B5876]">{row.reach.toLocaleString("pt-BR")}</p>
                    <p className="text-[12.5px] text-[#5B5876]">{row.likes.toLocaleString("pt-BR")}</p>
                    <p className="text-[12.5px] text-[#5B5876]">{row.comments.toLocaleString("pt-BR")}</p>
                    <p className="text-[12.5px] text-[#5B5876]">{row.shares.toLocaleString("pt-BR")}</p>
                    <p className="text-[12.5px] text-[#5B5876]">{row.saved.toLocaleString("pt-BR")}</p>
                    <p className="text-[12.5px] font-semibold">{row.engagementPct.toFixed(2).replace(".", ",")}%</p>
                    <div>
                      <span
                        className="inline-block rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap"
                        style={{ background: row.perf.bg, color: row.perf.color }}
                      >
                        {row.perf.label}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {filteredReels.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[12.5px] text-muted-foreground">
                Mostrando {(clampedPage - 1) * PAGE_SIZE + 1} a {Math.min(clampedPage * PAGE_SIZE, filteredReels.length)} de{" "}
                {filteredReels.length} reels
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={clampedPage <= 1}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F6F5FC] text-[#5B5876] disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-[12.5px] font-semibold text-[#5B5876]">
                  Página {clampedPage} de {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={clampedPage >= totalPages}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F6F5FC] text-[#5B5876] disabled:opacity-40"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : null}
        </Card>
      ) : (
        <Card className="p-[22px]">
          <p className="mb-4 text-base font-bold">Resumo diário</p>
          {dailyStats.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ainda sem dados. O primeiro resumo aparece após a primeira coleta de métricas.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex min-w-[640px] flex-col">
                <div className="grid grid-cols-[1.4fr_1fr_1fr_0.7fr_1fr_1fr_1fr] gap-2.5 border-b border-border px-2 pb-3 text-xs font-bold text-[#5B5876]">
                  <div>Data</div>
                  <div className="text-right">Seguidores</div>
                  <div className="text-right">Ganhos no dia</div>
                  <div className="text-right">Posts</div>
                  <div className="text-right">Views</div>
                  <div className="text-right">Curtidas</div>
                  <div className="text-right">Comentários</div>
                </div>
                {[...dailyStats].reverse().map((day) => (
                  <div
                    key={day.date}
                    className="grid grid-cols-[1.4fr_1fr_1fr_0.7fr_1fr_1fr_1fr] items-center gap-2.5 border-b border-[#F1F0F8] px-2 py-3.5"
                  >
                    <p className="text-[13px] font-semibold">{formatBrasilia(`${day.date}T00:00:00`, "PPP")}</p>
                    <p className="text-right text-[13px]">{day.followersCount != null ? day.followersCount.toLocaleString("pt-BR") : "—"}</p>
                    <p className="text-right text-[13px] font-semibold text-[#2563EB]">
                      {day.followersGained != null ? `${day.followersGained >= 0 ? "+" : ""}${day.followersGained}` : "—"}
                    </p>
                    <p className="text-right text-[13px]">{day.postsCount}</p>
                    <p className="text-right text-[13px]">{day.totalViews.toLocaleString("pt-BR")}</p>
                    <p className="text-right text-[13px]">{day.totalLikes.toLocaleString("pt-BR")}</p>
                    <p className="text-right text-[13px]">{day.totalComments.toLocaleString("pt-BR")}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
