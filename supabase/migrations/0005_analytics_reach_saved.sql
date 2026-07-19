-- ---------------------------------------------------------------------------
-- Adiciona reach/saved (Graph API) às métricas por post e seus agregados
-- diários — usados na tela Métricas (stat cards, insights, gráfico
-- "Desempenho por dia"). Colunas novas nascem em 0/null; coletas antigas não
-- têm esse dado retroativo (a API só retorna o total atual, não histórico).
-- ---------------------------------------------------------------------------

alter table public.analytics
  add column reach bigint not null default 0,
  add column saved bigint not null default 0;

alter table public.account_stats_daily
  add column total_reach bigint not null default 0,
  add column total_saves bigint not null default 0;
