-- Staff roles + role-based access.
--
-- Adds team-member roles alongside the original client | super_admin. Staff
-- (admin/manager/agent) help run the OPERATOR's Instasuite: they see the
-- operator's data, gated per-feature in the app (src/lib/permissions.ts). Only
-- `client` stays own-scoped (the legacy tenant path).
--
-- Single-operator assumption: because staff are not separate tenants, every
-- business is owned by a super_admin, so "staff see the operator's data" == "see
-- all data". If real client tenants are added later, staff scoping needs an
-- operator/org boundary — not modelled here.

-- 1. Widen the role check to include the staff roles.
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles
  add constraint profiles_role_check
  check (role in ('client', 'super_admin', 'admin', 'manager', 'agent'));

-- 2. is_staff(): any role that works ON the operator's data (i.e. not a `client`
--    tenant). Mirrors is_super_admin(); security definer so RLS can call it.
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
     where id = auth.uid()
       and role in ('super_admin', 'admin', 'manager', 'agent')
  );
$$;

-- 3. Broaden the data-visibility policies from super_admin-only to any staff.
--    The data APIs use the service-role client + getContext, so this RLS change
--    is what lets STAFF Realtime (inbox live updates, which run under the user's
--    JWT) and any user-scoped read see the operator's rows. `client` tenants stay
--    scoped by `client_id = auth.uid()`.
drop policy if exists "own businesses" on businesses;
create policy "own businesses" on businesses for select to authenticated
  using (client_id = auth.uid() or public.is_staff());

drop policy if exists "own scripts" on scripts;
create policy "own scripts" on scripts for select to authenticated
  using (
    exists (select 1 from businesses b
             where b.id = scripts.business_id
               and (b.client_id = auth.uid() or public.is_staff()))
  );

drop policy if exists "own ig accounts" on instagram_accounts;
create policy "own ig accounts" on instagram_accounts for select to authenticated
  using (
    exists (select 1 from businesses b
             where b.id = instagram_accounts.business_id
               and (b.client_id = auth.uid() or public.is_staff()))
  );

drop policy if exists "own conversations" on instagram_conversations;
create policy "own conversations" on instagram_conversations for select to authenticated
  using (
    exists (select 1 from instagram_accounts a
              join businesses b on b.id = a.business_id
             where a.id = instagram_conversations.instagram_account_id
               and (b.client_id = auth.uid() or public.is_staff()))
  );

drop policy if exists "own messages" on instagram_messages;
create policy "own messages" on instagram_messages for select to authenticated
  using (
    exists (select 1 from instagram_conversations c
              join instagram_accounts a on a.id = c.instagram_account_id
              join businesses b on b.id = a.business_id
             where c.id = instagram_messages.conversation_id
               and (b.client_id = auth.uid() or public.is_staff()))
  );
