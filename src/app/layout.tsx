import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppNav } from "@/components/app/nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <div className="flex min-h-screen">
          <aside className="w-56 shrink-0 border-r border-border">
            <div className="px-4 py-4">
              <span className="text-lg font-semibold">PosteiFlow</span>
              <p className="text-xs text-muted-foreground">@humordeporco</p>
            </div>
            <AppNav />
          </aside>
          <main className="flex-1 min-w-0 p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
