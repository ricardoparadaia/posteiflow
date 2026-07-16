"use client";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn(
    "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY não definidos — upload de vídeo não vai funcionar."
  );
}

// Cliente restrito ao browser, usado SÓ para o upload direto de vídeo para o
// Storage via signed upload URL (contorna o limite de tamanho de corpo de
// requisição das Serverless Functions da Vercel). A anon key é segura para
// expor no client: RLS está habilitado sem policies em todas as tabelas, e o
// upload em si só é permitido por causa do token assinado gerado no servidor
// com a service role key.
export const supabaseBrowser = createClient(
  url || "https://placeholder.supabase.co",
  anonKey || "placeholder-anon-key",
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export const VIDEOS_BUCKET = "videos";
