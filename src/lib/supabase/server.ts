import "server-only";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Cliente Supabase pra Server Components/Route Handlers — sessão via cookie (não localStorage), lida pelo mesmo mecanismo que o middleware usa pra proteger as rotas. */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component chamando set() fora de uma Server Action/Route
            // Handler — não tem como escrever cookie aqui mesmo, e não
            // precisa: o middleware já renova a sessão a cada request.
          }
        },
      },
    }
  );
}

/** getUser() valida o JWT contra o servidor da Supabase a cada chamada — cache() dedup dentro do mesmo request, já que layout e página costumam pedir o usuário autenticado separadamente. */
export const getAuthUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
