import "server-only";
import type { NextRequest } from "next/server";

/**
 * Protege as rotas /api/cron/* — só aceita chamadas com
 * "Authorization: Bearer <CRON_SECRET>". Usado tanto pelo pg_cron
 * (via pg_net) quanto pelo Vercel Cron (que envia esse mesmo header
 * automaticamente quando CRON_SECRET está configurado).
 */
export function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error("CRON_SECRET não está definido no .env");
  }
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}
