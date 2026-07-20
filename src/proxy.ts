import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Uso pessoal, single-user: sessão do Supabase Auth via cookie protege todo
// o app (páginas + API), exceto /api/cron/*, que já tem sua própria proteção
// via "Authorization: Bearer <CRON_SECRET>" (o pg_cron/Vercel Cron não sabem
// fazer login interativo), e o manifest/ícones do PWA, que o navegador busca
// sem credenciais ao checar instalabilidade.
export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!api/cron|_next/static|_next/image|favicon.ico|manifest.webmanifest|icon-192.png|icon-512.png|icon$|apple-icon$).*)",
  ],
};
