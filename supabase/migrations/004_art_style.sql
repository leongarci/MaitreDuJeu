-- Style visuel / ambiance de la campagne (parchment, space…)
alter table public.campaigns
  add column if not exists art_style text not null default '';
