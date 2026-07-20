import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PosteiFlow",
    short_name: "PosteiFlow",
    description: "Agendamento de Reels e métricas — @humordeporco",
    start_url: "/",
    display: "standalone",
    background_color: "#F6F6FB",
    theme_color: "#7C5CFC",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
