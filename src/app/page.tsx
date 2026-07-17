import { CheckCircle2, Circle, Users, Video as VideoIcon, Eye, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/app/stat-card";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveInstagramAccount } from "@/lib/account";
import { getAccountInfo } from "@/lib/instagram";
import { getLatestAnalyticsMap, sumMetrics } from "@/lib/metrics";
import { formatBrasilia, getBrasiliaDateString, startOfBrasiliaDay } from "@/lib/format-date";
import type { Post, Video } from "@/types/db";

export const dynamic = "force-dynamic";

type PostWithVideo = Post & { video: Video };

async function getDashboardData() {
  const account = await getActiveInstagramAccount();
  // Dia civil de Brasília, não UTC — consistente com o bucketing em
  // analytics-collector.ts (senão "Seguidores hoje" buscaria account_stats_daily
  // pela data errada durante parte do dia).
  const todayStr = getBrasiliaDateString();
  const dayStart = startOfBrasiliaDay(todayStr);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

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
    .select("followers_count, followers_gained")
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

  return {
    connected: !!account,
    username: account?.username ?? null,
    followersCount,
    followersGainedToday: todayStats?.followers_gained ?? null,
    totalPublished: totalPublished ?? 0,
    totalViews: totals.views,
    nextPost: (nextPost as PostWithVideo | null) ?? null,
    todayPosts: (todayPosts as PostWithVideo[] | null) ?? [],
  };
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {data.connected ? `Conectado como @${data.username}` : "Instagram não conectado — vá em Configuração"}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Seguidores"
          value={data.followersCount != null ? data.followersCount.toLocaleString("pt-BR") : "—"}
          icon={Users}
        />
        <StatCard
          label="Seguidores hoje"
          value={
            data.followersGainedToday != null
              ? `${data.followersGainedToday >= 0 ? "+" : ""}${data.followersGainedToday}`
              : "—"
          }
          hint="desde a última coleta"
          icon={TrendingUp}
        />
        <StatCard
          label="Nº de posts publicados"
          value={data.totalPublished.toLocaleString("pt-BR")}
          icon={VideoIcon}
        />
        <StatCard
          label="Total de views"
          value={data.totalViews.toLocaleString("pt-BR")}
          icon={Eye}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Próxima postagem agendada</CardTitle>
        </CardHeader>
        <CardContent>
          {data.nextPost ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{data.nextPost.video.filename}</p>
                <p className="text-sm text-muted-foreground">
                  {formatBrasilia(data.nextPost.scheduled_datetime, "PPPp")}
                </p>
              </div>
              <Badge variant="secondary">{data.nextPost.status}</Badge>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma postagem agendada.</p>
          )}
        </CardContent>
      </Card>

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
                    {post.status === "publicado" ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
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
    </div>
  );
}
