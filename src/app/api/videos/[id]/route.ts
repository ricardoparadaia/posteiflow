import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, VIDEOS_BUCKET } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: video, error: fetchError } = await supabaseAdmin
    .from("videos")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!video) {
    return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });
  }

  const { error: deleteError } = await supabaseAdmin.from("videos").delete().eq("id", id);

  if (deleteError) {
    if (deleteError.code === "23503") {
      return NextResponse.json(
        { error: "Este vídeo tem agendamentos vinculados e não pode ser excluído" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const pathsToRemove = [video.storage_path];
  if (video.thumbnail_url) {
    const thumbPath = extractStoragePath(video.thumbnail_url);
    if (thumbPath) pathsToRemove.push(thumbPath);
  }
  await supabaseAdmin.storage.from(VIDEOS_BUCKET).remove(pathsToRemove);

  return NextResponse.json({ ok: true });
}

function extractStoragePath(publicUrl: string): string | null {
  const marker = `/object/public/${VIDEOS_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(publicUrl.slice(idx + marker.length));
}
