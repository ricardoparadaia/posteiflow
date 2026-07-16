import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date"); // YYYY-MM-DD

  let query = supabaseAdmin
    .from("posts")
    .select("*, video:videos(*)")
    .order("scheduled_datetime", { ascending: true });

  if (date) {
    const start = `${date}T00:00:00.000Z`;
    const end = new Date(new Date(start).getTime() + 24 * 60 * 60 * 1000).toISOString();
    query = query.gte("scheduled_datetime", start).lt("scheduled_datetime", end);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ posts: data });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const videoId = body?.video_id;
  const scheduledDatetime = body?.scheduled_datetime;

  if (typeof videoId !== "string" || typeof scheduledDatetime !== "string") {
    return NextResponse.json(
      { error: "video_id e scheduled_datetime são obrigatórios" },
      { status: 400 }
    );
  }

  const scheduledDate = new Date(scheduledDatetime);
  if (Number.isNaN(scheduledDate.getTime())) {
    return NextResponse.json({ error: "scheduled_datetime inválido" }, { status: 400 });
  }

  const { data: video, error: videoError } = await supabaseAdmin
    .from("videos")
    .select("id")
    .eq("id", videoId)
    .maybeSingle();

  if (videoError) {
    return NextResponse.json({ error: videoError.message }, { status: 500 });
  }
  if (!video) {
    return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("posts")
    .insert({
      video_id: videoId,
      scheduled_datetime: scheduledDate.toISOString(),
      status: "pendente",
    })
    .select("*, video:videos(*)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ post: data }, { status: 201 });
}
