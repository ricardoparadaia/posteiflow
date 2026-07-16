import "server-only";
import { supabaseAdmin } from "./supabase";
import { getActiveInstagramAccount } from "./account";
import {
  createReelsContainer,
  getContainerStatus,
  publishContainer,
  getPublishingLimit,
  InstagramApiError,
} from "./instagram";
import type { Post, Video } from "@/types/db";

export interface SchedulerRunSummary {
  skipped?: string;
  finishedAndPublished: number;
  stillProcessing: number;
  containersCreated: number;
  rescheduledForQuota: number;
  timedOut: number;
  errors: number;
}

const RESCHEDULE_BUFFER_MS = 60_000; // 1 min de folga além do horário livre
const PROCESSING_TIMEOUT_MS = 30 * 60 * 1000; // container preso em IN_PROGRESS além disso vira erro
const LOCK_WINDOW_MS = 55_000; // um pouco menos que o intervalo de 1 min do pg_cron

/**
 * Roda um "tick" do scheduler. Desenhado para ser chamado a cada minuto e
 * terminar rápido: cada post avança no máximo um passo da máquina de estados
 * (pendente -> processando -> publicado), nunca fica em polling bloqueante
 * dentro da função — isso evita estourar o timeout de função serverless.
 */
export async function runSchedulerTick(): Promise<SchedulerRunSummary> {
  const summary: SchedulerRunSummary = {
    finishedAndPublished: 0,
    stillProcessing: 0,
    containersCreated: 0,
    rescheduledForQuota: 0,
    timedOut: 0,
    errors: 0,
  };

  const claimed = await claimSchedulerLock();
  if (!claimed) {
    summary.skipped = "Outro tick do scheduler já está em execução (lock não obtido)";
    return summary;
  }

  try {
    const account = await getActiveInstagramAccount();
    if (!account) {
      summary.skipped = "Nenhuma conta do Instagram conectada";
      return summary;
    }

    if (account.token_expires_at && new Date(account.token_expires_at) <= new Date()) {
      summary.skipped = "Token do Instagram expirado — renove em Configurações";
      return summary;
    }

    const accessToken = account.access_token;
    const igUserId = account.ig_user_id;

    // -------------------------------------------------------------------
    // Fase A: avança posts já em "processando" (container criado)
    // -------------------------------------------------------------------
    const { data: processingPosts, error: processingError } = await supabaseAdmin
      .from("posts")
      .select("*")
      .eq("status", "processando")
      .order("scheduled_datetime", { ascending: true });

    if (processingError) {
      throw new Error(`Erro ao buscar posts em processamento: ${processingError.message}`);
    }

    for (const post of (processingPosts ?? []) as Post[]) {
      try {
        if (Date.now() - new Date(post.updated_at).getTime() > PROCESSING_TIMEOUT_MS) {
          await markError(
            post.id,
            `Container "${post.ig_container_id ?? "desconhecido"}" não saiu de IN_PROGRESS em ${Math.round(PROCESSING_TIMEOUT_MS / 60_000)} minutos`
          );
          summary.timedOut++;
          continue;
        }

        if (!post.ig_container_id) {
          await markError(post.id, "Post em 'processando' sem ig_container_id — inconsistência de dados");
          summary.errors++;
          continue;
        }

        const { status_code } = await getContainerStatus(post.ig_container_id, accessToken);

        if (status_code === "FINISHED") {
          const { quotaUsage, quotaTotal } = await getPublishingLimit(igUserId, accessToken);
          if (quotaUsage >= quotaTotal) {
            // Container já existe e continua válido; só espera a cota liberar.
            summary.stillProcessing++;
            continue;
          }

          const { id: mediaId } = await publishContainer(igUserId, accessToken, post.ig_container_id);
          await supabaseAdmin
            .from("posts")
            .update({
              status: "publicado",
              ig_media_id: mediaId,
              published_at: new Date().toISOString(),
              error_message: null,
            })
            .eq("id", post.id);
          summary.finishedAndPublished++;
        } else if (status_code === "IN_PROGRESS") {
          summary.stillProcessing++;
        } else {
          // EXPIRED ou ERROR
          await markError(post.id, `Instagram retornou status "${status_code}" para o container`);
          summary.errors++;
        }
      } catch (err) {
        await markError(post.id, formatError(err));
        summary.errors++;
      }
    }

    // -------------------------------------------------------------------
    // Fase B: inicia posts "pendente" cujo horário já chegou
    // -------------------------------------------------------------------
    const { data: duePosts, error: dueError } = await supabaseAdmin
      .from("posts")
      .select("*, video:videos(*)")
      .eq("status", "pendente")
      .lte("scheduled_datetime", new Date().toISOString())
      .order("scheduled_datetime", { ascending: true });

    if (dueError) {
      throw new Error(`Erro ao buscar posts pendentes: ${dueError.message}`);
    }

    for (const row of (duePosts ?? []) as (Post & { video: Video | null })[]) {
      try {
        if (!row.video?.storage_url) {
          await markError(row.id, "Vídeo associado ao post não foi encontrado ou não tem URL pública");
          summary.errors++;
          continue;
        }

        const { quotaUsage, quotaTotal } = await getPublishingLimit(igUserId, accessToken);
        if (quotaUsage >= quotaTotal) {
          const nextFreeSlot = await computeNextFreeSlot();
          await supabaseAdmin
            .from("posts")
            .update({
              scheduled_datetime: nextFreeSlot.toISOString(),
              error_message: `Limite de ${quotaTotal} publicações/24h atingido — reagendado automaticamente para ${nextFreeSlot.toLocaleString("pt-BR")}`,
            })
            .eq("id", row.id);
          summary.rescheduledForQuota++;
          // No limite atingido, os próximos due posts desta rodada também vão
          // esbarrar na mesma cota — não adianta continuar tentando agora.
          break;
        }

        const { id: containerId } = await createReelsContainer(
          igUserId,
          accessToken,
          row.video.storage_url,
          row.video.caption
        );

        await supabaseAdmin
          .from("posts")
          .update({ status: "processando", ig_container_id: containerId, error_message: null })
          .eq("id", row.id);
        summary.containersCreated++;
      } catch (err) {
        await markError(row.id, formatError(err));
        summary.errors++;
      }
    }

    return summary;
  } finally {
    await releaseSchedulerLock();
  }
}

/**
 * Reivindica o lock de execução via UPDATE condicional atômico: só sucede
 * se locked_until estiver nulo ou no passado. Evita que dois ticks do
 * pg_cron sobrepostos (ex: um tick anterior demorou mais de 1 min) processem
 * os mesmos posts ao mesmo tempo.
 */
async function claimSchedulerLock(): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("scheduler_lock")
    .update({ locked_until: new Date(Date.now() + LOCK_WINDOW_MS).toISOString() })
    .eq("id", true)
    .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao tentar obter o lock do scheduler: ${error.message}`);
  }
  return !!data;
}

async function releaseSchedulerLock(): Promise<void> {
  await supabaseAdmin.from("scheduler_lock").update({ locked_until: null }).eq("id", true);
}

async function markError(postId: string, message: string) {
  await supabaseAdmin
    .from("posts")
    .update({ status: "erro", error_message: message })
    .eq("id", postId);
}

function formatError(err: unknown): string {
  if (err instanceof InstagramApiError) {
    return `Instagram API: ${err.message} (status ${err.status}${err.code ? `, code ${err.code}` : ""})`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Usa o histórico local de publicações (nossa fonte de verdade para os
 * horários) para calcular quando a janela rolante de 24h libera espaço:
 * horário do publish mais antigo dentro das últimas 24h, mais 24h e uma
 * folga de 1 minuto.
 */
async function computeNextFreeSlot(): Promise<Date> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("posts")
    .select("published_at")
    .eq("status", "publicado")
    .gte("published_at", since)
    .order("published_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (data?.published_at) {
    return new Date(new Date(data.published_at).getTime() + 24 * 60 * 60 * 1000 + RESCHEDULE_BUFFER_MS);
  }
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}
