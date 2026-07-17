import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, VIDEOS_BUCKET } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Formatos aceitos pela Content Publishing API do Instagram para Reels
// (container .mp4 ou .mov, codec H.264/AAC — o codec em si não dá pra
// validar aqui, só a extensão do arquivo).
const ALLOWED_EXTENSIONS = [".mp4", ".mov"];

/**
 * Gera uma signed upload URL para o vídeo ir direto do browser para o
 * Supabase Storage, sem passar pelo corpo da nossa API route — necessário
 * porque a Vercel limita o tamanho do corpo de requisição de uma Serverless
 * Function (bem abaixo do tamanho normal de um Reels), então o vídeo não
 * pode trafegar pela nossa própria rota.
 */
export async function POST(request: NextRequest) {
  const { filename } = await request.json();
  if (!filename || typeof filename !== "string") {
    return NextResponse.json({ error: "filename é obrigatório" }, { status: 400 });
  }

  const lowerName = filename.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
    return NextResponse.json(
      { error: `Formato não suportado. Envie um vídeo ${ALLOWED_EXTENSIONS.join(" ou ")}.` },
      { status: 400 }
    );
  }

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${crypto.randomUUID()}-${safeName}`;

  const { data, error } = await supabaseAdmin.storage
    .from(VIDEOS_BUCKET)
    .createSignedUploadUrl(path);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ path, token: data.token });
}
