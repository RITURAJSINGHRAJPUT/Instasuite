-- Reservation feedback DMs. After a confirmed reservation's dine time, a cron (/api/cron/feedback) sends
-- the guest a thank-you that asks them to tag the brand. Two additions:
--   1. orders.feedback_sent_at — stamped after the send attempt so it's sent at most once (best-effort;
--      Instagram may reject a DM outside the 24h window, which still counts as "attempted").
--   2. businesses.public_handle — the brand's PUBLIC Instagram handle to tag (e.g. @pizza.capiche), which
--      is different from the connected DM-sending account (instagram_accounts.username). Editable on the
--      Businesses page.

alter table orders add column if not exists feedback_sent_at timestamptz;

alter table businesses add column if not exists public_handle text;

-- Seed the two known brands (idempotent; only fills a blank handle).
update businesses set public_handle = '@pizza.capiche' where name = 'Capiche' and public_handle is null;
update businesses set public_handle = '@aikomfort'     where name = 'Aiko'    and public_handle is null;
