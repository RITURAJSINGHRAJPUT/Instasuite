-- The order's absolute scheduled time (reservation date+time, or takeaway pickup time),
-- captured from the AI's `At:` handoff field. Lets the Inbox split conversations into
-- Ongoing vs Completed by whether that time has passed. Nullable: old rows and orders where
-- the AI didn't emit a parseable time stay null and are treated as Ongoing.

alter table orders add column if not exists scheduled_at timestamptz;
