-- Party groups + joint actions (JSON on campaigns) + character party_group_id

alter table public.campaigns
  add column if not exists party_groups jsonb not null default '[]'::jsonb;

alter table public.campaigns
  add column if not exists active_party_group_id text;

alter table public.campaigns
  add column if not exists pending_joint_action jsonb;

alter table public.characters
  add column if not exists party_group_id text not null default '';
