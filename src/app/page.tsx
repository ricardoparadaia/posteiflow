import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, Circle, Users, Video as VideoIcon, Eye, Heart, Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/app/stat-card";
import { FollowersGainChart, type FollowersGainPoint } from "@/components/app/followers-gain-chart";
import { QueueTimeline, type QueueTimelineItem } from "@/components/app/queue-timeline";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveInstagramAccount } from "@/lib/account";
import { getAccountInfo } from "@/lib/instagram";
import { getLatestAnalyticsMap, sumMetrics } from "@/lib/metrics";
import { formatBrasilia, getBrasiliaDateString, startOfBrasiliaDay } from "@/lib/format-date";
import type { Post, Video } from "@/types/db";

const FOLLOWERS_CHART_MAX_DAYS = 30;
const QUEUE_TIMELINE_LIMIT = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

export const dynamic = "force-dynamic";

type PostWithVideo = Post & { video: Video };

async function getDashboardData() {
  const account = await getActiveInstagramAccount();
  // Dia civil de Brasília, não UTC — consistente com o bucketing em
  // analytics-collector.ts (senão "Seguidores hoje" buscaria account_stats_daily
  // pela data errada durante parte do dia).
  const todayStr = getBrasiliaDateString();
  const dayStart = startOfBrasiliaDay(todayStr);
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);
  const tomorrowStr = getBrasiliaDateString(dayEnd);

  let followersCount: number | null = null;
  if (account && (!account.token_expires_at || new Date(account.token_expires_at) > new Date())) {
    try {
      const info = await getAccountInfo(account.ig_user_id, account.access_token);
      followersCount = info.followersCount;
    } catch {
      // segue com fallback abaixo
    }
  }

  const { data: todayStats } = await supabaseAdmin
    .from("account_stats_daily")
    .select("followers_count, followers_gained, total_views")
    .eq("stat_date", todayStr)
    .maybeSingle();

  if (followersCount === null) followersCount = todayStats?.followers_count ?? null;

  const { count: totalPublished } = await supabaseAdmin
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("status", "publicado");

  const latestAnalytics = await getLatestAnalyticsMap();
  const totals = sumMetrics(latestAnalytics.values());

  const { data: nextPost } = await supabaseAdmin
    .from("posts")
    .select("*, video:videos(*)")
    .in("status", ["pendente", "processando"])
    .gte("scheduled_datetime", new Date().toISOString())
    .order("scheduled_datetime", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: todayPosts } = await supabaseAdmin
    .from("posts")
    .select("*, video:videos(*)")
    .gte("scheduled_datetime", dayStart.toISOString())
    .lt("scheduled_datetime", dayEnd.toISOString())
    .order("scheduled_datetime", { ascending: true });

  const followersGainSeries = await getFollowersGainSeries(todayStr);
  const upcomingQueue = await getUpcomingQueue(todayStr, tomorrowStr);

  // Deltas honestos: só calculamos o que dá pra sustentar com o dado que já
  // temos. "Seguidores" tem base (dia anterior) pra virar %; "posts
  // publicados" e "views" de hoje não têm um snapshot histórico comparável,
  // então mostramos o número real do dia em vez de fabricar uma porcentagem.
  const followersGainedToday = todayStats?.followers_gained ?? null;
  const previousFollowersCount =
    followersCount != null && followersGainedToday != null ? followersCount - followersGainedToday : null;
  const followersGainedPercent =
    followersGainedToday != null && previousFollowersCount != null && previousFollowersCount > 0
      ? (followersGainedToday / previousFollowersCount) * 100
      : null;

  const postsPublishedToday = (todayPosts ?? []).filter((p) => p.status === "publicado").length;
  const viewsToday = todayStats?.total_views ?? null;

  const postsWithAnalytics = latestAnalytics.size;
  const engagementRate =
    followersCount != null && followersCount > 0 && postsWithAnalytics > 0
      ? ((totals.likes + totals.comments + totals.shares) / (postsWithAnalytics * followersCount)) * 100
      : null;

  return {
    connected: !!account,
    username: account?.username ?? null,
    followersCount,
    followersGainedToday,
    followersGainedPercent,
    totalPublished: totalPublished ?? 0,
    postsPublishedToday,
    totalViews: totals.views,
    viewsToday,
    engagementRate,
    nextPost: (nextPost as PostWithVideo | null) ?? null,
    todayPosts: (todayPosts as PostWithVideo[] | null) ?? [],
    followersGainSeries,
    upcomingQueue,
  };
}

/**
 * Série de "seguidores ganhos por dia" para o gráfico do Dashboard. Reaproveita
 * account_stats_daily.followers_gained, já calculado pelo analytics-collector
 * (comparação com o dia anterior armazenado) — não recalcula nada aqui.
 * Busca sempre a janela máxima (30 dias); o seletor de período no gráfico só
 * recorta esse array no client, sem nova consulta.
 * Dias sem coleta simplesmente não geram um ponto (o eixo X pula pra frente);
 * quando o gap é maior que 1 dia, o ponto seguinte carrega `sinceDate` pra o
 * tooltip deixar claro que aquele número é o acumulado do período, não de 1 dia.
 */
async function getFollowersGainSeries(todayStr: string): Promise<FollowersGainPoint[]> {
  const windowStart = new Date(startOfBrasiliaDay(todayStr).getTime() - (FOLLOWERS_CHART_MAX_DAYS - 1) * DAY_MS);
  const windowStartStr = getBrasiliaDateString(windowStart);

  const { data: rows } = await supabaseAdmin
    .from("account_stats_daily")
    .select("stat_date, followers_gained")
    .gte("stat_date", windowStartStr)
    .lte("stat_date", todayStr)
    .not("followers_gained", "is", null)
    .order("stat_date", { ascending: true });

  return (rows ?? []).map((row, index, all) => {
    const prev = all[index - 1];
    let sinceDate: string | null = null;
    if (prev) {
      const gapDays =
        (startOfBrasiliaDay(row.stat_date).getTime() - startOfBrasiliaDay(prev.stat_date).getTime()) / DAY_MS;
      if (gapDays > 1) sinceDate = prev.stat_date;
    }
    return { date: row.stat_date, gained: row.followers_gained as number, sinceDate };
  });
}

/** Próximos posts (pendente/processando) em ordem cronológica, pra timeline do card "Fila de postagens". */
async function getUpcomingQueue(
  todayStr: string,
  tomorrowStr: string
): Promise<{ items: QueueTimelineItem[]; totalCount: number }> {
  const { data, count } = await supabaseAdmin
    .from("posts")
    .select("id, scheduled_datetime, video:videos(filename, thumbnail_url)", { count: "exact" })
    .in("status", ["pendente", "processando"])
    .gte("scheduled_datetime", new Date().toISOString())
    .order("scheduled_datetime", { ascending: true })
    .limit(QUEUE_TIMELINE_LIMIT);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    scheduled_datetime: string;
    video: { filename: string; thumbnail_url: string | null } | null;
  }>;

  const items: QueueTimelineItem[] = rows.map((row) => {
    const dateStr = getBrasiliaDateString(new Date(row.scheduled_datetime));
    const dayLabel =
      dateStr === todayStr ? "Hoje" : dateStr === tomorrowStr ? "Amanhã" : formatBrasilia(`${dateStr}T00:00:00`, "dd/MM");
    return {
      id: row.id,
      filename: row.video?.filename ?? "—",
      thumbnailUrl: row.video?.thumbnail_url ?? null,
      scheduledDatetime: row.scheduled_datetime,
      dayLabel,
    };
  });

  return { items, totalCount: count ?? 0 };
}

/** Progresso (0-100) do tempo decorrido entre a criação do post e o horário agendado. */
function computeCountdown(createdAt: string, scheduledAt: string): { percent: number; label: string } {
  const created = new Date(createdAt).getTime();
  const scheduled = new Date(scheduledAt).getTime();
  const now = Date.now();
  const total = scheduled - created;
  const percent = total > 0 ? Math.min(100, Math.max(0, ((now - created) / total) * 100)) : 100;
  return { percent, label: formatRemaining(scheduled - now) };
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "Publicando a qualquer momento";
  const totalMinutes = Math.round(ms / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `Faltam ${days}d ${hours}h`;
  if (hours > 0) return `Faltam ${hours}h ${minutes}m`;
  return `Faltam ${minutes}m`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function DashboardPage() {
  const data = await getDashboardData();
  const countdown = data.nextPost ? computeCountdown(data.nextPost.created_at, data.nextPost.scheduled_datetime) : null;
  const greetingName = process.env.APP_USERNAME ? capitalize(process.env.APP_USERNAME) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold">{greetingName ? `Olá, ${greetingName}! 👋` : "Dashboard"}</h1>
          <p className="text-sm text-muted-foreground">
            {data.connected
              ? `Aqui está o desempenho da sua conta @${data.username}`
              : "Instagram não conectado — vá em Configuração"}
          </p>
        </div>
        <Button asChild className="self-start sm:self-auto">
          <Link href="/queue">
            <Plus className="h-4 w-4" />
            Nova postagem
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Seguidores"
          value={data.followersCount != null ? data.followersCount.toLocaleString("pt-BR") : "—"}
          icon={Users}
          accent="violet"
          hint={
            data.followersGainedToday != null
              ? `${data.followersGainedToday >= 0 ? "+" : ""}${data.followersGainedToday}${
                  data.followersGainedPercent != null
                    ? ` (${data.followersGainedPercent >= 0 ? "+" : ""}${data.followersGainedPercent.toFixed(1)}%)`
                    : ""
                } desde a última coleta`
              : undefined
          }
          hintClassName={
            data.followersGainedToday == null
              ? undefined
              : data.followersGainedToday >= 0
                ? "text-emerald-600"
                : "text-red-600"
          }
        />
        <StatCard
          label="Posts publicados"
          value={data.totalPublished.toLocaleString("pt-BR")}
          icon={VideoIcon}
          accent="emerald"
          hint={data.postsPublishedToday > 0 ? `+${data.postsPublishedToday} hoje` : undefined}
          hintClassName={data.postsPublishedToday > 0 ? "text-emerald-600" : undefined}
        />
        <StatCard
          label="Total de views"
          value={data.totalViews.toLocaleString("pt-BR")}
          icon={Eye}
          accent="sky"
          hint={data.viewsToday != null && data.viewsToday > 0 ? `+${data.viewsToday.toLocaleString("pt-BR")} hoje` : undefined}
          hintClassName={data.viewsToday != null && data.viewsToday > 0 ? "text-emerald-600" : undefined}
        />
        <StatCard
          label="Engajamento médio"
          value={data.engagementRate != null ? `${data.engagementRate.toFixed(1)}%` : "—"}
          icon={Heart}
          accent="amber"
          hint={data.engagementRate != null ? "(curtidas+comentários+compartilhamentos) / (posts × seguidores)" : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Publicações de hoje</CardTitle>
          </CardHeader>
          <CardContent>
            {data.todayPosts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma publicação agendada para hoje.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {data.todayPosts.map((post) => (
                  <li key={post.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded bg-muted">
                        {post.video.thumbnail_url ? (
                          <Image
                            src={post.video.thumbnail_url}
                            alt={post.video.filename}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <VideoIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="absolute -bottom-0.5 -right-0.5 rounded-full bg-background">
                          {post.status === "publicado" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                          ) : (
                            <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                      <span className="truncate text-sm">{post.video.filename}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {formatBrasilia(post.scheduled_datetime, "HH:mm")}
                      </span>
                      <Badge variant={post.status === "publicado" ? "default" : post.status === "erro" ? "destructive" : "secondary"}>
                        {post.status}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Próxima postagem agendada</CardTitle>
            </CardHeader>
            <CardContent>
              {data.nextPost && countdown ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-muted">
                      {data.nextPost.video.thumbnail_url ? (
                        <Image
                          src={data.nextPost.video.thumbnail_url}
                          alt={data.nextPost.video.filename}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <VideoIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{data.nextPost.video.filename}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatBrasilia(data.nextPost.scheduled_datetime, "PPPp")}
                      </p>
                    </div>
                    <Badge variant="secondary">Reels</Badge>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Progress value={countdown.percent} />
                    <p className="text-xs text-muted-foreground">{countdown.label}</p>
                  </div>
                  <Button asChild variant="outline" size="sm" className="self-start">
                    <Link href="/queue">Ver na fila</Link>
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma postagem agendada.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fila de postagens</CardTitle>
            </CardHeader>
            <CardContent>
              <QueueTimeline items={data.upcomingQueue.items} totalCount={data.upcomingQueue.totalCount} />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Seguidores ganhos por dia</CardTitle>
          <CardDescription>
            Barras acima da linha são ganho, abaixo são perda.{" "}
            <Link href="/analytics" className="underline hover:text-foreground">
              Ver tabela completa
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FollowersGainChart data={data.followersGainSeries} />
        </CardContent>
      </Card>
    </div>
  );
}
