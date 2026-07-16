-- PosteiFlow — schema inicial (schema public)
-- Rode este arquivo manualmente no SQL Editor do Supabase (projeto novo e dedicado).
-- Depois rode 0002_cron_jobs.sql (após o deploy, quando você já tiver a URL pública do app).

create extension if not exists pgcrypto; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- users
-- v1 é single-user, mas mantemos a tabela para permitir multiusuário no futuro
-- ---------------------------------------------------------------------------
create table public.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- instagram_accounts
-- ---------------------------------------------------------------------------
create table public.instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  ig_user_id text not null unique,
  username text,
  access_token text not null,
  token_expires_at timestamptz,
  token_last_refreshed_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- videos — biblioteca
-- ---------------------------------------------------------------------------
create table public.videos (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  storage_path text not null,
  storage_url text not null,
  duration_seconds numeric,
  width int,
  height int,
  thumbnail_url text,
  caption text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- posts — agendamentos
-- status:
--   pendente    -> aguardando o horário agendado
--   processando -> container criado na API do Instagram, aguardando FINISHED
--                  (estado interno do scheduler, evita travar a função serverless
--                   em polling; não faz parte do enum pedido originalmente mas é
--                   necessário para o worker rodar em passos curtos a cada minuto)
--   publicado   -> publicado com sucesso (ig_media_id preenchido)
--   erro        -> falhou (error_message preenchido)
-- ---------------------------------------------------------------------------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete restrict,
  scheduled_datetime timestamptz not null,
  status text not null default 'pendente'
    check (status in ('pendente', 'processando', 'publicado', 'erro')),
  ig_container_id text,
  ig_media_id text,
  error_message text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index posts_status_scheduled_idx on public.posts (status, scheduled_datetime);
create index posts_video_id_idx on public.posts (video_id);

-- ---------------------------------------------------------------------------
-- analytics — métricas coletadas por post publicado
-- ---------------------------------------------------------------------------
create table public.analytics (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  collected_at timestamptz not null default now(),
  views bigint not null default 0,
  likes bigint not null default 0,
  comments bigint not null default 0,
  shares bigint not null default 0
);

create index analytics_post_id_idx on public.analytics (post_id);
create index analytics_collected_at_idx on public.analytics (collected_at desc);

-- ---------------------------------------------------------------------------
-- account_stats_daily — snapshot diário da conta, usado nas telas de
-- Dashboard ("seguidores ganhos hoje") e Analytics ("resumo diário").
-- Não estava na lista original de tabelas, mas é necessário para calcular
-- "seguidores +N" ao longo do tempo (precisa de histórico, não só do valor
-- atual da API do Instagram).
-- ---------------------------------------------------------------------------
create table public.account_stats_daily (
  id uuid primary key default gen_random_uuid(),
  stat_date date not null unique,
  followers_count int,
  followers_gained int,
  posts_count int not null default 0,
  total_views bigint not null default 0,
  total_likes bigint not null default 0,
  total_comments bigint not null default 0,
  collected_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- scheduler_lock — trava de execução única do scheduler.
-- Linha única (id sempre true). Cada tick do /api/cron/scheduler tenta
-- "reivindicar" o lock com um UPDATE condicional (locked_until no passado ou
-- nulo); se dois ticks do pg_cron se sobrepuserem (ex: um tick demorou mais
-- de 60s), só um consegue o claim, evitando criar dois containers ou
-- publicar duas vezes o mesmo post.
-- ---------------------------------------------------------------------------
create table public.scheduler_lock (
  id boolean primary key default true check (id),
  locked_until timestamptz
);

insert into public.scheduler_lock (id, locked_until) values (true, null);

-- ---------------------------------------------------------------------------
-- updated_at automático em instagram_accounts / posts
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger instagram_accounts_set_updated_at
  before update on public.instagram_accounts
  for each row execute function public.set_updated_at();

create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: habilitado em todas as tabelas, sem policies para anon/authenticated.
-- O app usa exclusivamente a SUPABASE_SERVICE_KEY no servidor (service_role),
-- que ignora RLS. Isso garante que, se a chave anon algum dia vazar ou for
-- adicionada por engano no client, nenhuma tabela fica exposta.
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.instagram_accounts enable row level security;
alter table public.videos enable row level security;
alter table public.posts enable row level security;
alter table public.analytics enable row level security;
alter table public.account_stats_daily enable row level security;
alter table public.scheduler_lock enable row level security;
