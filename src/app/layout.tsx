import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

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
  appleWebApp: {
    capable: true,
    title: "PosteiFlow",
    statusBarStyle: "default",
  },
  other: {
    // Next só emite a tag moderna sem prefixo (mobile-web-app-capable) a
    // partir de appleWebApp.capable — a legada com prefixo ainda é o que
    // versões mais antigas do iOS/Safari checam pra abrir em modo standalone.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#7C5CFC",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
