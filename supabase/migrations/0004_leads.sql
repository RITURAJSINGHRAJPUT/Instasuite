-- Landing page "Request access" capture.
-- Public signup is disabled (manual onboarding), so the landing CTA collects a
-- lead instead of creating an account. Reviewed by the super-admin in /admin.

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  instagram_handle text,
  message text,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'converted', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists idx_leads_created on leads(created_at desc);

alter table leads enable row level security;

-- Reads are super-admin only. There is deliberately NO insert policy: rows are
-- written by the public API route via the service-role client, which bypasses
-- RLS. That keeps the anon key from being able to read or write this table.
drop policy if exists "super admin reads leads" on leads;
create policy "super admin reads leads" on leads for select to authenticated
  using (public.is_super_admin());
