"use client";

import { useCallback, useEffect, useState } from "react";
import { formatBrasilia } from "@/lib/format-date";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type TokenSource = "exchanged" | "refreshed_direct" | "fallback_unverified";

interface AccountInfo {
  connected: boolean;
  ig_user_id?: string;
  username?: string | null;
  access_token_masked?: string;
  token_expires_at?: string | null;
  token_last_refreshed_at?: string | null;
  token_source?: TokenSource | null;
  connected_at?: string;
  tokenExpired?: boolean;
  followersCount?: number;
  mediaCount?: number;
  publishingLimit?: { quotaUsage: number; quotaTotal: number };
  liveDataError?: string;
}

function tokenSourceLabel(source: TokenSource | null | undefined): string {
  switch (source) {
    case "exchanged":
      return "Trocado (curto → longo)";
    case "refreshed_direct":
      return "Renovado diretamente";
    case "fallback_unverified":
      return "Não verificado (fallback)";
    default:
      return "—";
  }
}

interface InfoRow {
  label: string;
  value: string;
  valueClassName?: string;
  barPct?: number;
}

function InfoRows({ rows }: { rows: InfoRow[] }) {
  return (
    <div className="flex flex-col">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex flex-col justify-between gap-1 border-b border-[#F1F0F8] py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:gap-4"
        >
          <p className="shrink-0 text-[13.5px] font-medium text-muted-foreground">{row.label}</p>
          <div className="min-w-0 w-full sm:w-auto">
            <p className={cn("text-[13.5px] font-semibold sm:text-right", row.valueClassName)}>{row.value}</p>
            {row.barPct != null ? (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, row.barPct)}%` }} />
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function InstagramSettings() {
  const [data, setData] = useState<AccountInfo | null>(null);
  const [expiresSoon, setExpiresSoon] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<"connect" | "refresh" | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/instagram/account");
      const json: AccountInfo = await res.json();
      setData(json);
      setExpiresSoon(
        !!json.token_expires_at &&
          new Date(json.token_expires_at).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000
      );
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Busca o status da conexão ao montar a tela — é o padrão de
    // "sincronizar com um sistema externo" (fetch on mount), não um efeito
    // colateral de uma mudança de estado local.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleConnect() {
    setActionLoading("connect");
    setMessage(null);
    try {
      const res = await fetch("/api/instagram/connect", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Falha ao conectar");
      setMessage({
        type: "success",
        text: `Conta conectada com sucesso (${tokenSourceLabel(json.tokenSource)}).`,
      });
      await load();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRefresh() {
    setActionLoading("refresh");
    setMessage(null);
    try {
      const res = await fetch("/api/instagram/refresh", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Falha ao renovar token");
      setMessage({ type: "success", text: "Token renovado com sucesso." });
      await load();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <Card className="p-[22px]">
        <p className="mb-4 text-base font-bold">Conexão com o Instagram</p>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </Card>
    );
  }

  const statusPill = data?.connected
    ? data.tokenExpired
      ? { label: "Token expirado", className: "bg-[#FEE2E2] text-[#DC2626]" }
      : { label: "Conectado", className: "bg-[#DCFCE7] text-[#16A34A]" }
    : { label: "Não conectado", className: "bg-[#F1F0F8] text-[#5B5876]" };

  const infoRows: InfoRow[] = data?.connected
    ? [
        { label: "Conta", value: `@${data.username ?? data.ig_user_id}` },
        { label: "Token", value: data.access_token_masked ?? "—" },
        {
          label: "Expira em",
          value:
            (data.token_expires_at ? formatBrasilia(data.token_expires_at, "PPPp") : "—") +
            (data.token_source === "fallback_unverified" ? " (estimativa)" : ""),
          valueClassName: expiresSoon ? "text-destructive" : undefined,
        },
        {
          label: "Última renovação",
          value: data.token_last_refreshed_at ? formatBrasilia(data.token_last_refreshed_at, "PPPp") : "—",
        },
        { label: "Origem do token", value: tokenSourceLabel(data.token_source) },
        ...(data.followersCount != null
          ? [{ label: "Seguidores", value: data.followersCount.toLocaleString("pt-BR") }]
          : []),
        ...(data.publishingLimit
          ? [
              {
                label: "Publicações (24h)",
                value: `${data.publishingLimit.quotaUsage} / ${data.publishingLimit.quotaTotal}`,
                barPct: (data.publishingLimit.quotaUsage / data.publishingLimit.quotaTotal) * 100,
              },
            ]
          : []),
      ]
    : [];

  return (
    <Card className="p-[22px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <p className="text-base font-bold">Conexão com o Instagram</p>
        <span className={cn("shrink-0 rounded-full px-3 py-1 text-[11px] font-bold whitespace-nowrap", statusPill.className)}>
          {statusPill.label}
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {message ? (
          <Alert variant={message.type === "error" ? "destructive" : "default"}>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        ) : null}

        {data?.connected ? (
          <InfoRows rows={infoRows} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhuma conta conectada. Verifique se IG_APP_SECRET, IG_ACCESS_TOKEN e IG_USER_ID estão
            no .env e clique em Conectar.
          </p>
        )}

        {data?.token_source === "fallback_unverified" ? (
          <Alert>
            <AlertDescription>
              A data de expiração deste token é uma <strong>estimativa (60 dias)</strong>, não
              confirmada pela Meta — nem a troca (ig_exchange_token) nem a renovação direta
              (ig_refresh_token) funcionaram para este token. O alerta de 7 dias antes de expirar
              pode não ser preciso. Considere clicar em &quot;Renovar Token&quot; mais tarde (só
              funciona depois de 24h da conexão) para obter uma expiração real.
            </AlertDescription>
          </Alert>
        ) : null}

        {data?.liveDataError ? (
          <p className="text-xs text-destructive">Aviso: {data.liveDataError}</p>
        ) : null}

        <div className="flex gap-2.5">
          <Button
            onClick={handleConnect}
            disabled={actionLoading !== null}
            variant="outline"
            className="rounded-[10px] border-border text-[13.5px] font-semibold text-[#5B5876] hover:bg-secondary/70"
          >
            {actionLoading === "connect" ? "Conectando…" : data?.connected ? "Reconectar" : "Conectar"}
          </Button>
          {data?.connected ? (
            <Button
              onClick={handleRefresh}
              disabled={actionLoading !== null}
              className="rounded-[10px] bg-primary text-[13.5px] font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {actionLoading === "refresh" ? "Renovando…" : "Renovar Token"}
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
