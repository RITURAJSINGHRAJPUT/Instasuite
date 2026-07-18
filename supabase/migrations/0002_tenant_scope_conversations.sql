-- Phase 1 part 2: scope existing conversations to a tenant, then fix the unique
-- constraints that silently break tenant #2.
--
-- TOUCHES LIVE DATA: 6 conversations / 101 messages. Steps 1-3 are ordered so the
-- NOT NULL is only applied after every existing row has been backfilled.
-- The account id below is the seeded @sparshnfc account (ig_account_id 17841475977456877).

-- 1. Add the tenant key as NULLABLE first, so existing rows survive the add.
alter table instagram_conversations
  add column if not exists instagram_account_id uuid
  references instagram_accounts(id) on delete cascade;

-- 2. Backfill: every pre-existing conversation belongs to the seeded @sparshnfc account.
--    (Resolved by lookup rather than a hardcoded id, so this is re-runnable.)
update instagram_conversations
   set instagram_account_id = (
     select id from instagram_accounts where ig_account_id = '17841475977456877'
   )
 where instagram_account_id is null;

-- 3. Only now can it be required.
alter table instagram_conversations
  alter column instagram_account_id set not null;

-- 4. THE fix. igsid was globally UNIQUE, so a customer DMing a second tenant hit an
--    uncaught 23505 -> the conversation was never created -> silent no-reply forever.
--    Uniqueness is per-account, not global.
alter table instagram_conversations
  drop constraint if exists instagram_conversations_igsid_key;
alter table instagram_conversations
  add constraint instagram_conversations_account_igsid_key
  unique (instagram_account_id, igsid);

-- 5. Same class of bug: a globally-unique mid lets one tenant's row block another
--    tenant's insert, and the webhook's 23505 handler would silently swallow it as
--    a Meta retry. Scope it to the conversation instead.
alter table instagram_messages
  drop constraint if exists instagram_messages_instagram_msg_id_key;
create unique index if not exists instagram_messages_convo_msgid_key
  on instagram_messages (conversation_id, instagram_msg_id)
  where instagram_msg_id is not null;

create index if not exists idx_conversations_account
  on instagram_conversations(instagram_account_id);
