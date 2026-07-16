import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Cancela (exclui) um agendamento — só permitido enquanto ainda está "pendente". */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: post, error: fetchError } = await supabaseAdmin
    .from("posts")
    .select("status")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!post) {
    return NextResponse.json({ error: "Agendamento não encontrado" }, { status: 404 });
  }
  if (post.status !== "pendente") {
    return NextResponse.json(
      { error: "Só é possível cancelar agendamentos com status 'pendente'" },
      { status: 409 }
    );
  }

  const { error } = await supabaseAdmin.from("posts").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * Reprocessa manualmente um post que caiu em "erro": volta para "pendente"
 * com container/mídia/erro limpos, mantendo o scheduled_datetime original.
 * O scheduler pega ele de novo no próximo tick.
 */
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: post, error: fetchError } = await supabaseAdmin
    .from("posts")
    .select("status")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!post) {
    return NextResponse.json({ error: "Agendamento não encontrado" }, { status: 404 });
  }
  if (post.status !== "erro") {
    return NextResponse.json(
      { error: "Só é possível reprocessar agendamentos com status 'erro'" },
      { status: 409 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("posts")
    .update({
      status: "pendente",
      ig_container_id: null,
      ig_media_id: null,
      error_message: null,
    })
    .eq("id", id)
    .select("*, video:videos(*)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, post: data });
}
