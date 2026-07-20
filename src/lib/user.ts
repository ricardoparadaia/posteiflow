import type { User } from "@supabase/supabase-js";
import { capitalize } from "@/lib/utils";

/** Nome de exibição do usuário autenticado — user_metadata.name (definido ao criar o usuário no Supabase) ou, na ausência, a parte local do email. */
export function getDisplayName(user: User | null): string | null {
  if (!user) return null;
  const raw = (user.user_metadata?.name as string | undefined) ?? user.email?.split("@")[0];
  return raw ? capitalize(raw) : null;
}
