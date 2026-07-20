/** Mesma marca usada em nav.tsx (Logo) — quadrado com gradiente da marca + seta branca — reaproveitada aqui pra gerar os ícones do PWA (favicon, apple-touch-icon, manifest) via ImageResponse. */
export function AppIconMark({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #8B5CF6, #6D4CFB)",
      }}
    >
      <svg width={size * 0.53} height={size * 0.53} viewBox="0 0 24 24" fill="none">
        <path d="M4 20 L14 4 L20 4 L10 20 Z" fill="#fff" />
      </svg>
    </div>
  );
}
