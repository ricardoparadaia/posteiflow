import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runSchedulerTick } from "@/lib/scheduler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const summary = await runSchedulerTick();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("Erro no scheduler:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// Permite disparo manual via GET durante desenvolvimento (mesmo secret).
export async function GET(request: NextRequest) {
  return POST(request);
}
