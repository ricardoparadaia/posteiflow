"use client";
import { createBrowserClient } from "@supabase/ssr";

/** Cliente Supabase pro browser — sessão via cookie (httpOnly, Secure, SameSite), lida também pelo servidor. Diferente de supabase-browser.ts (só upload de vídeo, sem auth). */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
