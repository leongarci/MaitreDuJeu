-- Affrontement (init / CA) stocké sur la campagne
alter table public.campaigns
  add column if not exists encounter jsonb;
