-- "Closed" outlets — staff mark a whole outlet shut for today / a window / until reopened. The AI
-- agent reads the active rows (src/lib/availability.ts injects them into the tenant's system prompt)
-- and stops taking reservations / takeaway orders for that outlet until the window ends.
--
-- Sibling of `unavailable_dishes` (0007): same free-text/prose model and active-window rule
-- (starts_at <= now() AND (ends_at IS NULL OR ends_at > now())). Difference: `outlet` is REQUIRED
-- (a closure must name the outlet) and there is no `dish` — the whole outlet is down.

create table if not exists unavailable_outlets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  outlet text not null,
  note text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,         -- NULL = until further notice (cleared manually)
  created_at timestamptz not null default now()
);

create index if not exists idx_unavailable_outlets_business_ends
  on unavailable_outlets(business_id, ends_at);

alter table unavailable_outlets enable row level security;

-- Readable by the owning client or any staff, via the businesses ownership chain — mirrors the
-- "own unavailable_dishes" policy in 0007. Writes go through the service-role API (supabaseAdmin),
-- which bypasses RLS, so there is deliberately no insert/delete policy.
drop policy if exists "own unavailable_outlets" on unavailable_outlets;
create policy "own unavailable_outlets" on unavailable_outlets for select to authenticated
  using (
    exists (select 1 from businesses b
             where b.id = unavailable_outlets.business_id
               and (b.client_id = auth.uid() or public.is_staff()))
  );
