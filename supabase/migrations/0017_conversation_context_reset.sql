-- A moving "fresh start" boundary for a conversation. Set to the confirmation message's timestamp
-- the moment a reservation/takeaway is captured, so the next AI turn is fed only the messages AFTER
-- this point — the finished order is hidden and the AI starts fresh (it can't resume what it can't
-- see). The webhook lifts this filter for a single turn when the guest clearly asks about a past order.
-- Nullable: null means "no order placed yet" = full history, i.e. today's behaviour.

alter table instagram_conversations
  add column if not exists context_reset_at timestamptz;
