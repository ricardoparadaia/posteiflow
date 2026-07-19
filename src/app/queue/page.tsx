import { QueueView } from "@/components/app/queue-view";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveInstagramAccount } from "@/lib/account";
import { getPublishingLimit } from "@/lib/instagram";
import { getBrasiliaDateString, startOfBrasiliaDay } from "@/lib/format-date";
import type { Post, Video } from "@/types/db";

export const dynamic = "force-dynamic";

type PostWithVideo = Post & { video: Video };

async function getQueueData() {
  const dayStart = startOfBrasiliaDay(getBrasiliaDateString());

  // Posts que ainda devem aparecer na Fila: qualquer um não-terminal
  // (pendente/processando/erro), ou publicado hoje (Brasília). Publicados de
  // dias anteriores ficam de fora — é o que faz eles "sumirem" no dia seguinte.
  const { data: activePosts, error: activeError } = await supabaseAdmin
    .from("posts")
    .select("*, video:videos(*)")
    .or(`status.neq.publicado,and(status.eq.publicado,published_at.gte.${dayStart.toISOString()})`)
    .order("scheduled_datetime", { ascending: true });

  if (activeError) throw new Error(activeError.message);

  // Vídeos que nunca tiveram nenhum post (upload feito, ainda não agendado)
  // — inclui os que ficaram pendentes de configurar de uma sessão anterior.
  const { data: postedVideoRows, error: postedError } = await supabaseAdmin
    .from("posts")
    .select("video_id");
  if (postedError) throw new Error(postedError.message);
  const scheduledVideoIds = new Set((postedVideoRows ?? []).map((p) => p.video_id));

  const { data: allVideos, error: videosError } = await supabaseAdmin
    .from("videos")
    .select("*")
    .order("created_at", { ascending: true });
  if (videosError) throw new Error(videosError.message);

  const unscheduledVideos = (allVideos ?? []).filter((v) => !scheduledVideoIds.has(v.id));

  return {
    activePosts: (activePosts ?? []) as PostWithVideo[],
    unscheduledVideos: unscheduledVideos as Video[],
  };
}

/** Cota atual de publicação (best-effort — só para o aviso na tela, não bloqueia nada). */
async function getQuotaHint(): Promise<{ quotaUsage: number; quotaTotal: number } | null> {
  try {
    const account = await getActiveInstagramAccount();
    if (!account) return null;
    if (account.token_expires_at && new Date(account.token_expires_at) <= new Date()) return null;
    return await getPublishingLimit(account.ig_user_id, account.access_token);
  } catch {
    return null;
  }
}

export default async function QueuePage() {
  const [{ activePosts, unscheduledVideos }, quota] = await Promise.all([
    getQueueData(),
    getQuotaHint(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-[26px]">Fila</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Envie vários vídeos, ajuste legendas e horários, e agende tudo de uma vez.
        </p>
      </div>

      <QueueView
        initialUnscheduled={unscheduledVideos}
        initialActivePosts={activePosts}
        quota={quota}
      />
    </div>
  );
}
