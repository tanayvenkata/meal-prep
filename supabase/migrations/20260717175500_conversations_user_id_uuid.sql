-- Conversations are owned by Supabase Auth users, just like pantry items.
-- Production was checked before this migration: every existing user_id is a
-- valid UUID, so the explicit cast is safe and does not silently rewrite data.
alter table public.conversations
  alter column user_id type uuid using user_id::uuid;

alter table public.conversations
  add constraint conversations_user_id_fkey
  foreign key (user_id) references auth.users(id);
