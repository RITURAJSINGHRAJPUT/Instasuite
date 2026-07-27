-- Decouple captured orders / reviews from the chat's lifecycle.
--
-- Before: orders.conversation_id and review_items.conversation_id were NOT NULL … ON DELETE CASCADE, so
-- deleting a conversation (Inbox → Delete) wiped its orders/takeaways/reviews and killed any pending
-- feedback (which needs the customer's igsid + the sending account, both read off the conversation).
--
-- Now: snapshot the igsid + the account onto each row at capture, and change conversation_id to
-- ON DELETE SET NULL (nullable). A deleted chat leaves the order/review intact — it still shows in the
-- Orders/Review tabs (scoped by instagram_account_id) and feedback/confirmation DMs still send using the
-- stored igsid + account. Deleting the whole ACCOUNT still removes its orders (that FK is cascade).

-- ---- orders ----
alter table orders add column if not exists igsid text;
alter table orders add column if not exists instagram_account_id uuid references instagram_accounts(id) on delete cascade;

alter table orders alter column conversation_id drop not null;
alter table orders drop constraint if exists orders_conversation_id_fkey;
alter table orders add constraint orders_conversation_id_fkey
  foreign key (conversation_id) references instagram_conversations(id) on delete set null;

-- ---- review_items ----
alter table review_items add column if not exists igsid text;
alter table review_items add column if not exists instagram_account_id uuid references instagram_accounts(id) on delete cascade;

alter table review_items alter column conversation_id drop not null;
alter table review_items drop constraint if exists review_items_conversation_id_fkey;
alter table review_items add constraint review_items_conversation_id_fkey
  foreign key (conversation_id) references instagram_conversations(id) on delete set null;

-- ---- backfill from the current conversation (so existing rows survive a later chat delete) ----
update orders o
  set igsid = c.igsid, instagram_account_id = c.instagram_account_id
  from instagram_conversations c
  where o.conversation_id = c.id and o.igsid is null;

update review_items r
  set igsid = c.igsid, instagram_account_id = c.instagram_account_id
  from instagram_conversations c
  where r.conversation_id = c.id and r.igsid is null;

create index if not exists orders_account_created on orders(instagram_account_id, created_at desc);
create index if not exists review_items_account_created on review_items(instagram_account_id, created_at desc);
