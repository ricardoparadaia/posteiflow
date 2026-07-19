export type PostStatus = "pendente" | "processando" | "publicado" | "erro";

/**
 * Como o token salvo em instagram_accounts foi obtido:
 * - exchanged: ig_exchange_token funcionou normalmente (token curto -> longo), expiração real.
 * - refreshed_direct: ig_exchange_token falhou por tipo de token (452/2207055), mas o token já
 *   era long-lived e ig_refresh_token funcionou direto nele — expiração real.
 * - fallback_unverified: nem exchange nem refresh funcionaram; o token foi usado como veio,
 *   com expiração ESTIMADA (60 dias), não confirmada pela Meta.
 */
export type TokenSource = "exchanged" | "refreshed_direct" | "fallback_unverified";

export interface User {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
}

export interface InstagramAccount {
  id: string;
  user_id: string | null;
  ig_user_id: string;
  username: string | null;
  access_token: string;
  token_expires_at: string | null;
  token_last_refreshed_at: string | null;
  token_source: TokenSource | null;
  connected_at: string;
  updated_at: string;
}

export interface Video {
  id: string;
  filename: string;
  storage_path: string;
  storage_url: string;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  thumbnail_url: string | null;
  caption: string | null;
  created_at: string;
}

export interface Post {
  id: string;
  video_id: string;
  scheduled_datetime: string;
  status: PostStatus;
  ig_container_id: string | null;
  ig_media_id: string | null;
  error_message: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PostWithVideo extends Post {
  video: Video;
}

export interface AnalyticsRecord {
  id: string;
  post_id: string;
  collected_at: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  saved: number;
}

export interface AccountStatsDaily {
  id: string;
  stat_date: string;
  followers_count: number | null;
  followers_gained: number | null;
  posts_count: number;
  total_views: number;
  total_likes: number;
  total_comments: number;
  total_reach: number;
  total_saves: number;
  collected_at: string;
}
