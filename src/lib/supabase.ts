import "server-only";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// Não lança erro aqui em cima: o passo "Collecting page data" do `next build`
// importa este módulo sem as env vars reais (só existem em runtime), e um
// throw no escopo do módulo derrubaria o build. As chamadas de fato só
// acontecem dentro das rotas/Server Components, em runtime, quando as env
// vars já estão garantidamente presentes (local via .env.local, produção via
// variáveis de ambiente da Vercel).
if (!supabaseUrl || !supabaseServiceKey) {
  console.warn(
    "SUPABASE_URL / SUPABASE_SERVICE_KEY não definidos — necessário em runtime."
  );
}

// Cliente server-only com a service role key. Nunca importe este módulo em
// código que roda no browser — o pacote `server-only` garante isso em build.
export const supabaseAdmin = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseServiceKey || "placeholder-service-key",
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export const VIDEOS_BUCKET = "videos";
