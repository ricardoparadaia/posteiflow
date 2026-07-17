"use client";

import { useCallback, useEffect, useState } from "react";
import { formatBrasilia } from "@/lib/format-date";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

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
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conexão com o Instagram</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Conexão com o Instagram</CardTitle>
        {data?.connected ? (
          data.tokenExpired ? (
            <Badge variant="destructive">Token expirado</Badge>
          ) : (
            <Badge variant="default">Conectado</Badge>
          )
        ) : (
          <Badge variant="secondary">Não conectado</Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {message ? (
          <Alert variant={message.type === "error" ? "destructive" : "default"}>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        ) : null}

        {data?.connected ? (
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Conta</dt>
            <dd>@{data.username ?? data.ig_user_id}</dd>

            <dt className="text-muted-foreground">Token</dt>
            <dd className="font-mono">{data.access_token_masked}</dd>

            <dt className="text-muted-foreground">Expira em</dt>
            <dd className={expiresSoon ? "text-destructive" : undefined}>
              {data.token_expires_at ? formatBrasilia(data.token_expires_at, "PPPp") : "—"}
              {data.token_source === "fallback_unverified" ? " (estimativa)" : ""}
            </dd>

            <dt className="text-muted-foreground">Última renovação</dt>
            <dd>
              {data.token_last_refreshed_at ? formatBrasilia(data.token_last_refreshed_at, "PPPp") : "—"}
            </dd>

            <dt className="text-muted-foreground">Origem do token</dt>
            <dd>{tokenSourceLabel(data.token_source)}</dd>

            {data.followersCount != null ? (
              <>
                <dt className="text-muted-foreground">Seguidores</dt>
                <dd>{data.followersCount.toLocaleString("pt-BR")}</dd>
              </>
            ) : null}

            {data.publishingLimit ? (
              <>
                <dt className="text-muted-foreground">Publicações (24h)</dt>
                <dd>
                  {data.publishingLimit.quotaUsage} / {data.publishingLimit.quotaTotal}
                </dd>
              </>
            ) : null}
          </dl>
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

        <div className="flex gap-2">
          <Button onClick={handleConnect} disabled={actionLoading !== null} variant="outline">
            {actionLoading === "connect" ? "Conectando…" : data?.connected ? "Reconectar" : "Conectar"}
          </Button>
          {data?.connected ? (
            <Button onClick={handleRefresh} disabled={actionLoading !== null}>
              {actionLoading === "refresh" ? "Renovando…" : "Renovar Token"}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
