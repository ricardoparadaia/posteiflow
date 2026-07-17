import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface BatchItemInput {
  video_id: string;
  scheduled_datetime: string;
  caption: string | null;
}

interface BatchItemResult {
  video_id: string;
  ok: boolean;
  post_id?: string;
  error?: string;
}

/**
 * Cria vários agendamentos de uma vez (tela Fila, botão "Agendar Todos").
 * Cada item é processado individualmente — um vídeo com problema (ex: já foi
 * excluído, horário inválido) não derruba os outros 19 do lote.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const items = body?.items;

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "items é obrigatório e não pode ser vazio" }, { status: 400 });
  }

  const results: BatchItemResult[] = [];

  for (const raw of items as BatchItemInput[]) {
    const videoId = raw?.video_id;
    const scheduledDatetime = raw?.scheduled_datetime;
    const caption = typeof raw?.caption === "string" && raw.caption.length > 0 ? raw.caption : null;

    if (typeof videoId !== "string" || typeof scheduledDatetime !== "string") {
      results.push({ video_id: String(videoId ?? "?"), ok: false, error: "video_id e scheduled_datetime são obrigatórios" });
      continue;
    }

    const scheduledDate = new Date(scheduledDatetime);
    if (Number.isNaN(scheduledDate.getTime())) {
      results.push({ video_id: videoId, ok: false, error: "scheduled_datetime inválido" });
      continue;
    }

    const { data: video, error: videoError } = await supabaseAdmin
      .from("videos")
      .select("id")
      .eq("id", videoId)
      .maybeSingle();

    if (videoError) {
      results.push({ video_id: videoId, ok: false, error: videoError.message });
      continue;
    }
    if (!video) {
      results.push({ video_id: videoId, ok: false, error: "Vídeo não encontrado (pode já ter sido excluído)" });
      continue;
    }

    const { error: updateCaptionError } = await supabaseAdmin
      .from("videos")
      .update({ caption })
      .eq("id", videoId);

    if (updateCaptionError) {
      results.push({ video_id: videoId, ok: false, error: updateCaptionError.message });
      continue;
    }

    const { data: post, error: insertError } = await supabaseAdmin
      .from("posts")
      .insert({
        video_id: videoId,
        scheduled_datetime: scheduledDate.toISOString(),
        status: "pendente",
      })
      .select("id")
      .single();

    if (insertError) {
      results.push({ video_id: videoId, ok: false, error: insertError.message });
      continue;
    }

    results.push({ video_id: videoId, ok: true, post_id: post.id });
  }

  return NextResponse.json({ results });
}
