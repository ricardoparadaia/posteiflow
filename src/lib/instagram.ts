import "server-only";

// Wrapper para a "Instagram API with Instagram Login" (graph.instagram.com),
// NÃO o fluxo de Facebook Login / Graph API de Páginas.
// Docs: https://developers.facebook.com/docs/instagram-platform

const GRAPH_HOST = "https://graph.instagram.com";
// Versão configurável via env para facilitar upgrade quando a Meta depreciar
// versões antigas, sem precisar mexer no código.
const GRAPH_VERSION = process.env.IG_GRAPH_API_VERSION || "v25.0";

export class InstagramApiError extends Error {
  status: number;
  code?: number;
  errorSubcode?: number;
  fbtraceId?: string;

  constructor(
    message: string,
    status: number,
    details?: { code?: number; error_subcode?: number; fbtrace_id?: string }
  ) {
    super(message);
    this.name = "InstagramApiError";
    this.status = status;
    this.code = details?.code;
    this.errorSubcode = details?.error_subcode;
    this.fbtraceId = details?.fbtrace_id;
  }
}

async function igRequest<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  init?: { method?: "GET" | "POST"; timeoutMs?: number }
): Promise<T> {
  const method = init?.method ?? "GET";
  const url = new URL(
    path.startsWith("http") ? path : `${GRAPH_HOST}/${path}`
  );
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    init?.timeoutMs ?? 30_000
  );

  let res: Response;
  try {
    res = await fetch(url.toString(), { method, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new InstagramApiError(
        `Timeout ao chamar a API do Instagram (${path})`,
        408
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = json?.error ?? {};
    throw new InstagramApiError(
      err.message || `Erro ${res.status} ao chamar a API do Instagram`,
      res.status,
      err
    );
  }

  return json as T;
}

// ---------------------------------------------------------------------------
// Gestão de token
// ---------------------------------------------------------------------------

interface TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in: number; // segundos
}

/** Troca um token de curta duração (~1h) por um de longa duração (~60 dias). */
export async function exchangeForLongLivedToken(
  shortLivedToken: string,
  appSecret: string
): Promise<TokenResponse> {
  return igRequest<TokenResponse>("access_token", {
    grant_type: "ig_exchange_token",
    client_secret: appSecret,
    access_token: shortLivedToken,
  });
}

/**
 * Renova um token de longa duração já existente. Só funciona se o token
 * tiver pelo menos 24h desde a última emissão/renovação e ainda não tiver
 * expirado.
 */
export async function refreshLongLivedToken(
  longLivedToken: string
): Promise<TokenResponse> {
  return igRequest<TokenResponse>("refresh_access_token", {
    grant_type: "ig_refresh_token",
    access_token: longLivedToken,
  });
}

// ---------------------------------------------------------------------------
// Content Publishing API (Reels)
// ---------------------------------------------------------------------------

export type ContainerStatus =
  | "EXPIRED"
  | "ERROR"
  | "FINISHED"
  | "IN_PROGRESS"
  | "PUBLISHED";

/** Cria o container de mídia para um Reels a partir de uma URL pública de vídeo. */
export async function createReelsContainer(
  igUserId: string,
  accessToken: string,
  videoUrl: string,
  caption: string | null
): Promise<{ id: string }> {
  return igRequest<{ id: string }>(
    `${GRAPH_VERSION}/${igUserId}/media`,
    {
      media_type: "REELS",
      video_url: videoUrl,
      caption: caption || undefined,
      access_token: accessToken,
    },
    { method: "POST" }
  );
}

/**
 * Consulta o status de processamento de um container de mídia. Pede também o
 * campo "status" (texto livre da Meta) além de "status_code" — quando o
 * container falha (ex: vídeo em codec não suportado como HEVC/H.265 em vez
 * de H.264), esse texto costuma trazer o motivo, em vez de só "ERROR".
 */
export async function getContainerStatus(
  containerId: string,
  accessToken: string
): Promise<{ status_code: ContainerStatus; status?: string }> {
  return igRequest(`${GRAPH_VERSION}/${containerId}`, {
    fields: "status_code,status",
    access_token: accessToken,
  });
}

/** Publica um container já com status FINISHED. */
export async function publishContainer(
  igUserId: string,
  accessToken: string,
  containerId: string
): Promise<{ id: string }> {
  return igRequest<{ id: string }>(
    `${GRAPH_VERSION}/${igUserId}/media_publish`,
    {
      creation_id: containerId,
      access_token: accessToken,
    },
    { method: "POST" }
  );
}

/** Uso atual da janela rolante de 24h (limite de 50 publicações). */
export async function getPublishingLimit(
  igUserId: string,
  accessToken: string
): Promise<{ quotaUsage: number; quotaTotal: number }> {
  const res = await igRequest<{
    data: Array<{
      quota_usage: number;
      config: { quota_total: number; quota_duration: number };
    }>;
  }>(`${GRAPH_VERSION}/${igUserId}/content_publishing_limit`, {
    fields: "config,quota_usage",
    access_token: accessToken,
  });

  const entry = res.data?.[0];
  return {
    quotaUsage: entry?.quota_usage ?? 0,
    quotaTotal: entry?.config?.quota_total ?? 50,
  };
}

// ---------------------------------------------------------------------------
// Conta / insights
// ---------------------------------------------------------------------------

export async function getAccountInfo(
  igUserId: string,
  accessToken: string
): Promise<{ username: string; followersCount: number; mediaCount: number }> {
  const res = await igRequest<{
    username: string;
    followers_count: number;
    media_count: number;
  }>(`${GRAPH_VERSION}/${igUserId}`, {
    fields: "username,followers_count,media_count",
    access_token: accessToken,
  });

  return {
    username: res.username,
    followersCount: res.followers_count,
    mediaCount: res.media_count,
  };
}

export interface MediaInsights {
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

/** Métricas de um Reel já publicado (views, likes, comments, shares). */
export async function getMediaInsights(
  mediaId: string,
  accessToken: string
): Promise<MediaInsights> {
  const res = await igRequest<{
    data: Array<{
      name: string;
      values?: Array<{ value: number }>;
      total_value?: { value: number };
    }>;
  }>(`${GRAPH_VERSION}/${mediaId}/insights`, {
    metric: "views,likes,comments,shares",
    access_token: accessToken,
  });

  const metrics: MediaInsights = { views: 0, likes: 0, comments: 0, shares: 0 };
  for (const item of res.data ?? []) {
    const value = item.values?.[0]?.value ?? item.total_value?.value ?? 0;
    if (item.name in metrics) {
      metrics[item.name as keyof MediaInsights] = value;
    }
  }
  return metrics;
}
