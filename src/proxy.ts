import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Uso pessoal, single-user: HTTP Basic Auth simples com usuário/senha fixos
// via env var. Protege todo o app (páginas + API), exceto /api/cron/*, que
// já tem sua própria proteção via "Authorization: Bearer <CRON_SECRET>" (o
// pg_cron/Vercel Cron não sabem fazer Basic Auth, e não faz sentido pedir
// duas autenticações diferentes na mesma rota).
export function proxy(request: NextRequest): NextResponse {
  const username = process.env.APP_USERNAME;
  const password = process.env.APP_PASSWORD;

  const unauthorized = () =>
    new NextResponse("Autenticação necessária", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="PosteiFlow"' },
    });

  // Sem credenciais configuradas -> nega tudo (fail closed), nunca libera
  // acesso por engano por falta de configuração.
  if (!username || !password) {
    return unauthorized();
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
    const separatorIndex = decoded.indexOf(":");
    const user = decoded.slice(0, separatorIndex);
    const pass = decoded.slice(separatorIndex + 1);

    if (user === username && pass === password) {
      return NextResponse.next();
    }
  }

  return unauthorized();
}

export const config = {
  matcher: ["/((?!api/cron|_next/static|_next/image|favicon.ico).*)"],
};
