create table if not exists feedback_messages (
  id text primary key,
  category text not null default 'other',
  contact text not null default '',
  message text not null,
  app_version text not null default 'unknown',
  platform text not null default 'unknown',
  locale text not null default 'zh-CN',
  installation_id text not null,
  ip_hash text not null,
  user_agent text not null default '',
  notification_status text not null default 'pending',
  created_at text not null
);

create index if not exists idx_feedback_messages_created_at
  on feedback_messages (created_at);

create index if not exists idx_feedback_messages_installation_created
  on feedback_messages (installation_id, created_at);

create index if not exists idx_feedback_messages_ip_created
  on feedback_messages (ip_hash, created_at);

create table if not exists announcements (
  id text primary key,
  title text not null,
  body text not null,
  level text not null default 'info',
  link_url text,
  min_version text,
  max_version text,
  platforms text not null default 'all',
  locales text not null default 'all',
  channels text not null default 'stable',
  starts_at text,
  ends_at text,
  enabled integer not null default 1,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists idx_announcements_enabled_created
  on announcements (enabled, created_at);
