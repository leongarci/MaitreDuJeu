-- Maître du Jeu — sync sans compte (accès via join_code côté API serveur)

create table if not exists public.campaigns (
  id text primary key,
  join_code text not null unique,
  title text not null default '',
  session_summary text not null default '',
  active_character_id text,
  current_scene_asset_id text,
  tts_muted boolean not null default false,
  pending_check jsonb,
  acted_this_round jsonb not null default '[]'::jsonb,
  scenario_cursor integer not null default 0,
  actions_on_beat integer not null default 0,
  scenario_validated boolean not null default false,
  pending_dialogue jsonb,
  party_groups jsonb not null default '[]'::jsonb,
  active_party_group_id text,
  pending_joint_action jsonb,
  created_at bigint not null,
  updated_at bigint not null
);

create index if not exists campaigns_join_code_idx on public.campaigns (join_code);

create table if not exists public.characters (
  id text primary key,
  campaign_id text not null references public.campaigns(id) on delete cascade,
  name text not null,
  attributes jsonb not null default '{}'::jsonb,
  hp integer not null default 1,
  max_hp integer not null default 1,
  inventory jsonb not null default '[]'::jsonb,
  party_group_id text not null default ''
);
create index if not exists characters_campaign_idx on public.characters (campaign_id);

create table if not exists public.messages (
  id text primary key,
  campaign_id text not null references public.campaigns(id) on delete cascade,
  role text not null,
  character_id text,
  text text not null,
  created_at bigint not null
);
create index if not exists messages_campaign_idx on public.messages (campaign_id, created_at);

create table if not exists public.scenario_beats (
  id text primary key,
  campaign_id text not null references public.campaigns(id) on delete cascade,
  beat_order integer not null default 0,
  title text not null default '',
  player_text text not null default '',
  mj_notes text not null default '',
  secrets text not null default '',
  transition text not null default '',
  objective text not null default '',
  validated boolean not null default false
);
create index if not exists scenario_beats_campaign_idx on public.scenario_beats (campaign_id, beat_order);

create table if not exists public.lore_entries (
  id text primary key,
  campaign_id text not null references public.campaigns(id) on delete cascade,
  kind text not null default 'autre',
  name text not null,
  aliases jsonb not null default '[]'::jsonb,
  summary text not null default '',
  mj_notes text not null default '',
  secrets text not null default ''
);
create index if not exists lore_entries_campaign_idx on public.lore_entries (campaign_id);

create table if not exists public.graph_nodes (
  id text primary key,
  campaign_id text not null references public.campaigns(id) on delete cascade,
  type text not null,
  name text not null,
  description text not null default '',
  mj_notes text not null default '',
  revealed boolean not null default true
);
create index if not exists graph_nodes_campaign_idx on public.graph_nodes (campaign_id);

create table if not exists public.graph_edges (
  id text primary key,
  campaign_id text not null references public.campaigns(id) on delete cascade,
  from_id text not null,
  to_id text not null,
  relation text not null,
  category text not null default 'social',
  affinity integer not null default 0,
  revealed boolean not null default true
);
create index if not exists graph_edges_campaign_idx on public.graph_edges (campaign_id);

create table if not exists public.pdf_chunks (
  id text primary key,
  campaign_id text not null references public.campaigns(id) on delete cascade,
  text text not null,
  index integer not null default 0,
  audience text not null default 'general'
);
create index if not exists pdf_chunks_campaign_idx on public.pdf_chunks (campaign_id, index);

create table if not exists public.assets_meta (
  id text primary key,
  campaign_id text not null references public.campaigns(id) on delete cascade,
  name text not null,
  type text not null,
  tags jsonb not null default '[]'::jsonb,
  mime_type text not null default ''
);
create index if not exists assets_meta_campaign_idx on public.assets_meta (campaign_id);

alter table public.campaigns enable row level security;
alter table public.characters enable row level security;
alter table public.messages enable row level security;
alter table public.scenario_beats enable row level security;
alter table public.lore_entries enable row level security;
alter table public.graph_nodes enable row level security;
alter table public.graph_edges enable row level security;
alter table public.pdf_chunks enable row level security;
alter table public.assets_meta enable row level security;

-- Accès uniquement via service role (routes Next.js). Pas de policies anon.
