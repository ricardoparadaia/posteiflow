import "server-only";
import { supabaseAdmin } from "./supabase";
import type { InstagramAccount } from "@/types/db";

/** v1 é single-user/single-conta: pega a conta do Instagram mais recente conectada. */
export async function getActiveInstagramAccount(): Promise<InstagramAccount | null> {
  const { data, error } = await supabaseAdmin
    .from("instagram_accounts")
    .select("*")
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar conta do Instagram: ${error.message}`);
  }
  return data;
}
