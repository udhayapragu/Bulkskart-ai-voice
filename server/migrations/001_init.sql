-- Bulkskart AI Voice Sales Agent: core schema.
-- Target: Supabase PostgreSQL (also runs on plain PostgreSQL 13+).
--
-- Security model:
--   * Row Level Security is enabled on every table with NO policies, so the
--     anon and authenticated API roles cannot read or write anything.
--   * The backend server connects with the database owner connection string
--     (DATABASE_URL), which bypasses RLS. That connection string and the
--     Supabase service-role key must never reach the frontend.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

create table if not exists suppliers (
  id                uuid primary key default gen_random_uuid(),
  phone_e164        text not null unique,
  company_name      text,
  contact_name      text,
  email             text,
  city              text,
  state             text,
  products          text[] not null default '{}',
  preferred_language text check (preferred_language in ('en', 'ta', 'hi', 'te', 'ml')),
  lead_status       text not null default 'new'
                    check (lead_status in ('new', 'interested', 'not_interested', 'callback_requested', 'registered')),
  do_not_call       boolean not null default false,
  do_not_call_at    timestamptz,
  contact_source    text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists suppliers_lead_status_idx on suppliers (lead_status);

create table if not exists consent_records (
  id          uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers (id) on delete cascade,
  status      text not null check (status in ('granted', 'withdrawn', 'unknown')),
  basis       text not null,
  source      text not null,
  evidence    text,
  recorded_at timestamptz not null default now()
);
create index if not exists consent_records_supplier_idx on consent_records (supplier_id, recorded_at desc);

create table if not exists campaigns (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  language              text not null default 'en' check (language in ('en', 'ta', 'hi', 'te', 'ml')),
  status                text not null default 'draft'
                        check (status in ('draft', 'running', 'paused', 'completed', 'archived')),
  mode                  text not null default 'mock' check (mode in ('mock', 'live')),
  from_number           text,
  max_attempts          integer not null default 3 check (max_attempts between 1 and 10),
  retry_delay_minutes   integer not null default 240 check (retry_delay_minutes >= 5),
  calling_window_start  text not null default '09:00' check (calling_window_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  calling_window_end    text not null default '19:00' check (calling_window_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  timezone              text not null default 'Asia/Kolkata',
  concurrency           integer not null default 2 check (concurrency between 1 and 50),
  recording_enabled     boolean not null default false,
  launched_by           text,
  launched_at           timestamptz,
  created_by            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists campaign_contacts (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references campaigns (id) on delete cascade,
  supplier_id     uuid not null references suppliers (id) on delete cascade,
  status          text not null default 'pending'
                  check (status in ('pending', 'in_progress', 'completed', 'exhausted', 'suppressed', 'skipped')),
  attempts        integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_outcome    text,
  created_at      timestamptz not null default now(),
  unique (campaign_id, supplier_id)
);
create index if not exists campaign_contacts_due_idx on campaign_contacts (campaign_id, status, next_attempt_at);

create table if not exists calls (
  id                   uuid primary key default gen_random_uuid(),
  campaign_id          uuid references campaigns (id) on delete set null,
  supplier_id          uuid references suppliers (id) on delete set null,
  direction            text not null check (direction in ('outbound', 'inbound')),
  mode                 text not null check (mode in ('mock', 'live')),
  provider             text not null,
  provider_call_id     text unique,
  from_number          text,
  to_number            text,
  language             text check (language in ('en', 'ta', 'hi', 'te', 'ml')),
  status               text not null default 'queued'
                       check (status in ('queued', 'dialing', 'ringing', 'in_progress', 'completed',
                                         'no_answer', 'busy', 'failed', 'canceled', 'handoff')),
  outcome              text check (outcome in ('new', 'interested', 'not_interested', 'callback_requested', 'registered')),
  attempt_no           integer not null default 1,
  transcript           jsonb not null default '[]'::jsonb,
  agent_state          jsonb not null default '{}'::jsonb,
  duration_seconds     integer,
  recording_url        text,
  recording_permitted  boolean not null default false,
  error_message        text,
  started_at           timestamptz,
  ended_at             timestamptz,
  created_at           timestamptz not null default now()
);
create index if not exists calls_campaign_idx on calls (campaign_id);
create index if not exists calls_supplier_idx on calls (supplier_id);
create index if not exists calls_created_idx on calls (created_at desc);

create table if not exists call_summaries (
  id                 uuid primary key default gen_random_uuid(),
  call_id            uuid not null unique references calls (id) on delete cascade,
  summary            text not null,
  recommended_action text not null,
  lead_status        text not null check (lead_status in ('new', 'interested', 'not_interested', 'callback_requested', 'registered')),
  language           text check (language in ('en', 'ta', 'hi', 'te', 'ml')),
  created_at         timestamptz not null default now()
);

create table if not exists follow_up_tasks (
  id          uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers (id) on delete cascade,
  call_id     uuid references calls (id) on delete set null,
  task_type   text not null check (task_type in ('callback', 'send_website_link', 'human_handoff', 'registration_help', 'review')),
  due_at      timestamptz,
  status      text not null default 'open' check (status in ('open', 'done', 'canceled')),
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists follow_up_tasks_status_idx on follow_up_tasks (status, due_at);

create table if not exists agent_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists knowledge_base (
  id          uuid primary key default gen_random_uuid(),
  language    text not null check (language in ('en', 'ta', 'hi', 'te', 'ml')),
  topic       text not null,
  question    text not null,
  answer      text not null,
  keywords    text[] not null default '{}',
  -- Only 'approved' entries may be spoken to suppliers.
  status      text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  approved_by text,
  approved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists knowledge_base_lookup_idx on knowledge_base (language, status);

create table if not exists audit_logs (
  id          bigint generated always as identity primary key,
  actor       text not null,
  action      text not null,
  entity_type text,
  entity_id   text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on audit_logs (created_at desc);

-- Deny-by-default for client-facing roles. All access goes through the backend.
alter table suppliers        enable row level security;
alter table consent_records  enable row level security;
alter table campaigns        enable row level security;
alter table campaign_contacts enable row level security;
alter table calls            enable row level security;
alter table call_summaries   enable row level security;
alter table follow_up_tasks  enable row level security;
alter table agent_settings   enable row level security;
alter table knowledge_base   enable row level security;
alter table audit_logs       enable row level security;

revoke all on suppliers, consent_records, campaigns, campaign_contacts, calls,
  call_summaries, follow_up_tasks, agent_settings, knowledge_base, audit_logs
  from anon, authenticated;
