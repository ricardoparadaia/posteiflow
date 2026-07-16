import "server-only";

/**
 * Envia um alerta pelo bot do Telegram já usado em outro projeto.
 * Se TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não estiverem definidos, a
 * função simplesmente não faz nada (sem lançar erro) — o alerta é opcional.
 */
export async function sendTelegramAlert(message: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) return;

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
        }),
      }
    );
    if (!res.ok) {
      console.error("Falha ao enviar alerta no Telegram:", await res.text());
    }
  } catch (err) {
    console.error("Erro ao enviar alerta no Telegram:", err);
  }
}
