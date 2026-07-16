import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, VIDEOS_BUCKET } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("videos")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ videos: data });
}

/**
 * Finaliza o cadastro de um vídeo cujo arquivo já foi enviado direto para o
 * Supabase Storage via signed upload URL (veja /api/videos/upload-url).
 * Recebe multipart/form-data: path, filename, duration, width, height,
 * caption (opcional), thumbnail (arquivo de imagem, opcional).
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();

  const path = form.get("path");
  const filename = form.get("filename");
  if (typeof path !== "string" || typeof filename !== "string") {
    return NextResponse.json({ error: "path e filename são obrigatórios" }, { status: 400 });
  }

  const duration = parseNumber(form.get("duration"));
  const width = parseNumber(form.get("width"));
  const height = parseNumber(form.get("height"));
  const caption = form.get("caption");
  const thumbnail = form.get("thumbnail");

  const { data: publicUrlData } = supabaseAdmin.storage.from(VIDEOS_BUCKET).getPublicUrl(path);
  const storageUrl = publicUrlData.publicUrl;

  let thumbnailUrl: string | null = null;
  if (thumbnail instanceof File) {
    const thumbPath = `thumbnails/${crypto.randomUUID()}.jpg`;
    const buffer = Buffer.from(await thumbnail.arrayBuffer());
    const { error: thumbError } = await supabaseAdmin.storage
      .from(VIDEOS_BUCKET)
      .upload(thumbPath, buffer, { contentType: thumbnail.type || "image/jpeg" });

    if (!thumbError) {
      thumbnailUrl = supabaseAdmin.storage.from(VIDEOS_BUCKET).getPublicUrl(thumbPath).data.publicUrl;
    }
  }

  const { data, error } = await supabaseAdmin
    .from("videos")
    .insert({
      filename,
      storage_path: path,
      storage_url: storageUrl,
      duration_seconds: duration,
      width,
      height,
      thumbnail_url: thumbnailUrl,
      caption: typeof caption === "string" && caption.length > 0 ? caption : null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ video: data }, { status: 201 });
}

function parseNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
