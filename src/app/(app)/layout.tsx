import { AppNav, MobileNavBar } from "@/components/app/nav";
import { getAuthUser } from "@/lib/supabase/server";
import { getDisplayName } from "@/lib/user";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getAuthUser();
  const username = getDisplayName(user);

  return (
    <>
      <MobileNavBar username={username} />
      <div className="flex min-h-screen">
        <aside className="hidden w-[236px] shrink-0 border-r border-border bg-card md:sticky md:top-0 md:block md:h-screen">
          <AppNav username={username} />
        </aside>
        <main className="min-w-0 flex-1 p-4 pt-[76px] md:p-8 md:pt-8">{children}</main>
      </div>
    </>
  );
}
