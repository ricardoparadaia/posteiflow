import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppNav, MobileNavBar } from "@/components/app/nav";
import { capitalize } from "@/lib/utils";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PosteiFlow",
  description: "Agendamento de Reels e métricas — @humordeporco",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const username = process.env.APP_USERNAME ? capitalize(process.env.APP_USERNAME) : null;

  return (
    <html lang="pt-BR" className={`${inter.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <MobileNavBar username={username} />
        <div className="flex min-h-screen">
          <aside className="hidden w-[236px] shrink-0 border-r border-border bg-card md:sticky md:top-0 md:block md:h-screen">
            <AppNav username={username} />
          </aside>
          <main className="min-w-0 flex-1 p-4 pt-[76px] md:p-8 md:pt-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
