-- Structured outlets per brand. Until now outlets were free text typed by hand (script prose +
-- the closure tables' `outlet` column). This makes them a real per-business list so the Unavailable
-- page can offer a dropdown instead of a text box. Keyed by business_id (NOT name), so renaming a
-- brand never orphans its outlets. The closure tables stay free text — the dropdown just writes the
-- chosen name into them, and the AI still reads outlets as prose.
--
-- Mirrors the parent-child pattern (scripts / unavailable_outlets): business_id FK + SELECT-only RLS
-- via the ownership chain; writes go through the service-role API (supabaseAdmin).

create table if not exists outlets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,                    -- "Name, City" e.g. "Piplod, Surat"
  created_at timestamptz not null default now(),
  unique (business_id, name)
);

create index if not exists idx_outlets_business on outlets(business_id);

alter table outlets enable row level security;

drop policy if exists "own outlets" on outlets;
create policy "own outlets" on outlets for select to authenticated
  using (
    exists (select 1 from businesses b
             where b.id = outlets.business_id
               and (b.client_id = auth.uid() or public.is_staff()))
  );

-- Seed the operator's known outlets, matched by brand name (idempotent). Name the two businesses
-- 'Capiche' / 'Aiko' before applying (the Businesses page has a rename field); anything that doesn't
-- match here can be added in the Businesses-page outlets editor.
insert into outlets (business_id, name)
select b.id, o.name
from businesses b
cross join (values ('Piplod, Surat'), ('Vesu, Surat'), ('Ambli, Ahmedabad'), ('Uni, Ahmedabad')) as o(name)
where b.name = 'Capiche'
on conflict (business_id, name) do nothing;

insert into outlets (business_id, name)
select b.id, o.name
from businesses b
cross join (values ('Pal, Surat'), ('Ambli, Ahmedabad')) as o(name)
where b.name = 'Aiko'
on conflict (business_id, name) do nothing;
