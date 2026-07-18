-- Phase 1: multi-tenant foundation.
-- Hierarchy: profiles (client) -> businesses -> instagram_accounts -> conversations.
-- Script resolution: instagram_accounts.script_id ?? businesses.default_script_id.

-- ---------- identity ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'client' check (role in ('client', 'super_admin')),
  created_at timestamptz not null default now()
);

-- ---------- billing ----------
create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  max_ig_accounts int not null default 1,      -- gates how many accounts a client may connect
  max_messages_per_month int,
  price_cents int not null default 0,
  stripe_price_id text,
  created_at timestamptz not null default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references profiles(id) on delete cascade,
  plan_id uuid not null references plans(id),
  status text not null default 'active'
    check (status in ('trialing', 'active', 'past_due', 'canceled')),
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- tenancy ----------
create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  default_script_id uuid,                       -- FK added below (circular with scripts)
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),  -- super-admin gate
  created_at timestamptz not null default now()
);

create table if not exists scripts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null default 'Default script',
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  alter table businesses add constraint businesses_default_script_id_fkey
    foreign key (default_script_id) references scripts(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  -- This is webhook entry[0].id — the routing key that decides which tenant a DM belongs to.
  ig_account_id text not null unique,
  username text,
  name text,
  profile_picture_url text,
  access_token text not null,                   -- another business's credential: never expose to the browser
  token_expires_at timestamptz,
  script_id uuid references scripts(id) on delete set null,  -- null => inherit businesses.default_script_id
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'disabled')),
  created_at timestamptz not null default now()
);

-- ---------- metering (feeds Phase 3 billing) ----------
create table if not exists usage_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references profiles(id) on delete set null,
  business_id uuid references businesses(id) on delete set null,
  instagram_account_id uuid references instagram_accounts(id) on delete set null,
  kind text not null default 'ai_reply',
  model text,
  input_tokens int,
  output_tokens int,
  cost_cents numeric(12, 5),
  created_at timestamptz not null default now()
);

create index if not exists idx_businesses_client on businesses(client_id);
create index if not exists idx_scripts_business on scripts(business_id);
create index if not exists idx_ig_accounts_business on instagram_accounts(business_id);
create index if not exists idx_ig_accounts_ig_account_id on instagram_accounts(ig_account_id);
create index if not exists idx_usage_events_client_created on usage_events(client_id, created_at desc);
