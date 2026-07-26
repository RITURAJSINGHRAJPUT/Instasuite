-- Review queue — non-order handoffs that need a human to review before completion.
--
-- When the AI hits something it must NOT handle itself — a collaboration/partnership request, a
-- complaint, a billing issue, an event/large-group enquiry, or anything it can't resolve — it appends a
-- structured handoff line (REVIEW | Type: … | …). The webhook parses that line and inserts ONE row here
-- (status 'pending') AND flips the conversation to human mode so the AI stops auto-replying. Staff work
-- the queue from the Review page and mark each item reviewed. Mirrors the `orders` ledger (0010): same
-- pending→done lifecycle, dedupe-key idempotency, and service-role-only access.

create table if not exists review_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  -- The conversation this came from: carries the customer's igsid + the account, so staff can open the
  -- chat in the Inbox to respond (unlike orders, we don't auto-DM — the reply is a real human message).
  conversation_id uuid not null references instagram_conversations(id) on delete cascade,
  -- Normalised bucket parsed from the line's `Type:` field: collaboration | complaint | billing | event
  -- | other (validated app-side, not a DB check — the AI's free text is mapped to one of these).
  category text not null,
  customer_name text,
  details text not null,               -- parsed, human-readable summary of the handoff line
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'dismissed')),
  -- Anti-dup: insert-first, treat a 23505 as "already captured, skip" (same pattern orders uses).
  -- Shape: `review:${conversationId}:${sha1(line)}`.
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists review_items_dedupe_key on review_items(dedupe_key);
create index if not exists review_items_business_created on review_items(business_id, created_at desc);

-- RLS on, with NO policy: touched only by the service-role client (webhook insert, the gated
-- /api/review route reads/updates). Rows carry a customer's name/details, so the anon key must never
-- read them. Same reasoning as `orders` / `leads`.
alter table review_items enable row level security;
