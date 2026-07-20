import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/server";
import { LoginForm } from "@/components/app/login-form";

export default async function LoginPage() {
  const user = await getAuthUser();

  if (user) redirect("/");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <LoginForm />
    </div>
  );
}
