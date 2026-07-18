-- Phase 1 part 3: RLS tenant isolation.
--
-- Replaces the earlier single-tenant policies, which were `using (true)` — i.e.
-- any anon key could read every conversation in the database. That was survivable
-- with one tenant; it is a breach with two.
--
-- NOTE: the service-role client bypasses RLS entirely, so these policies are the
-- safety net for user-scoped clients + Realtime, NOT the only lock. Every
-- user-driven query also carries an explicit ownership predicate in code.

alter table profiles             enable row level security;
alter table plans                enable row level security;
alter table subscriptions        enable row level security;
alter table businesses           enable row level security;
alter table scripts              enable row level security;
alter table instagram_accounts   enable row level security;
alter table usage_events         enable row level security;
alter table instagram_conversations enable row level security;
alter table instagram_messages      enable row level security;

-- Drop the old permissive single-tenant policies.
drop policy if exists "read conversations" on instagram_conversations;
drop policy if exists "read messages" on instagram_messages;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'super_admin');
$$;

-- ---------- profiles ----------
create policy "own profile" on profiles for select to authenticated
  using (id = auth.uid() or public.is_super_admin());

-- ---------- plans (catalogue: readable by any signed-in user) ----------
create policy "read plans" on plans for select to authenticated using (true);

-- ---------- subscriptions ----------
create policy "own subscription" on subscriptions for select to authenticated
  using (client_id = auth.uid() or public.is_super_admin());

-- ---------- businesses ----------
create policy "own businesses" on businesses for select to authenticated
  using (client_id = auth.uid() or public.is_super_admin());

-- ---------- scripts ----------
create policy "own scripts" on scripts for select to authenticated
  using (
    exists (select 1 from businesses b
             where b.id = scripts.business_id
               and (b.client_id = auth.uid() or public.is_super_admin()))
  );

-- ---------- instagram_accounts ----------
-- access_token lives on this table. RLS gates the row; the API layer additionally
-- never selects that column into a client response.
create policy "own ig accounts" on instagram_accounts for select to authenticated
  using (
    exists (select 1 from businesses b
             where b.id = instagram_accounts.business_id
               and (b.client_id = auth.uid() or public.is_super_admin()))
  );

-- ---------- usage_events ----------
create policy "own usage" on usage_events for select to authenticated
  using (client_id = auth.uid() or public.is_super_admin());

-- ---------- conversations (the chain: conversation -> account -> business -> client) ----------
create policy "own conversations" on instagram_conversations for select to authenticated
  using (
    exists (select 1 from instagram_accounts a
              join businesses b on b.id = a.business_id
             where a.id = instagram_conversations.instagram_account_id
               and (b.client_id = auth.uid() or public.is_super_admin()))
  );

-- ---------- messages ----------
-- This is also what scopes Realtime: the dashboard subscribes with the anon key,
-- so without it tenant A's browser would receive tenant B's message inserts live.
create policy "own messages" on instagram_messages for select to authenticated
  using (
    exists (select 1 from instagram_conversations c
              join instagram_accounts a on a.id = c.instagram_account_id
              join businesses b on b.id = a.business_id
             where c.id = instagram_messages.conversation_id
               and (b.client_id = auth.uid() or public.is_super_admin()))
  );
