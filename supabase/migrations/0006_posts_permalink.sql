-- ---------------------------------------------------------------------------
-- Guarda o link permanente do Reel no Instagram, obtido da Graph API logo
-- após a publicação — usado pra "Melhores posts" abrir o vídeo real no
-- Instagram em vez de só mostrar o nome do arquivo. Posts já publicados
-- antes desta coluna existir ficam com permalink nulo (sem link) até um
-- backfill manual, se desejado.
-- ---------------------------------------------------------------------------

alter table public.posts
  add column permalink text;
