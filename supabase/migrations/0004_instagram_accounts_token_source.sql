-- PosteiFlow — origem do token salvo em instagram_accounts
--
-- Rode depois de 0001_init.sql (pode rodar a qualquer momento, é incremental).
--
-- O fluxo de "Conectar" tenta, nessa ordem: (1) trocar o token curto pelo
-- longo via ig_exchange_token: token_source='exchanged'; se a Meta rejeitar
-- por tipo de token (452/2207055), (2) tenta renovar o token recebido
-- diretamente via ig_refresh_token, que só funciona se ele já for um token
-- long-lived: token_source='refreshed_direct'; se isso também falhar
-- (ex: token emitido há menos de 24h), (3) usa o token como está com uma
-- expiração estimada de 60 dias: token_source='fallback_unverified' — esse
-- último caso é o único em que a tela de Configuração mostra o aviso de
-- "expiração estimada, não confirmada".

alter table public.instagram_accounts
  add column if not exists token_source text
    check (token_source in ('exchanged', 'refreshed_direct', 'fallback_unverified'));
