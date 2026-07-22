-- Enforce RLS ownership on conversations + messages (issue #129).
--
-- Context: items and kitchen_tools already have RLS. conversations and messages
-- lived in the exposed public schema with RLS off, and message writes trusted
-- conversation UUID secrecy instead of ownership. UUID secrecy is not auth.
--
-- db.ts continues to connect as the table-owner postgres role (BYPASSRLS).
-- Per-request withUserContext impersonates authenticated so these policies
-- actually apply. Replacing the owner connection is issue #64.

-- ---------------------------------------------------------------------------
-- Enable RLS on the two chat tables
-- ---------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- ---------------------------------------------------------------------------
-- Rewrite ownership policies: explicit TO authenticated + (select auth.uid())
-- form. The select wrapper avoids re-evaluating auth.uid() per row (Supabase
-- auth_rls_initplan advisor).
-- ---------------------------------------------------------------------------
drop policy if exists "items_user_isolation" on public.items;
create policy "items_user_isolation"
on public.items
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "kitchen_tools_user_isolation" on public.kitchen_tools;
create policy "kitchen_tools_user_isolation"
on public.kitchen_tools
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "conversations_user_isolation"
on public.conversations
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Messages authorize through the owning parent conversation. Do not trust
-- conversation_id alone — a known foreign UUID must not permit inserts.
create policy "messages_via_conversation_owner"
on public.messages
for all
to authenticated
using (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and c.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and c.user_id = (select auth.uid())
  )
);

-- ---------------------------------------------------------------------------
-- Grants: authenticated needs ordinary DML; anon needs nothing on user data.
-- Revoke broad default privileges (TRUNCATE / REFERENCES / TRIGGER / ALL).
-- service_role keeps full access for platform operations.
-- ---------------------------------------------------------------------------
revoke all on table public.items from anon;
revoke all on table public.kitchen_tools from anon;
revoke all on table public.conversations from anon;
revoke all on table public.messages from anon;

revoke all on table public.items from authenticated;
revoke all on table public.kitchen_tools from authenticated;
revoke all on table public.conversations from authenticated;
revoke all on table public.messages from authenticated;

grant select, insert, update, delete on table public.items to authenticated;
grant select, insert, update, delete on table public.kitchen_tools to authenticated;
grant select, insert, update, delete on table public.conversations to authenticated;
grant select, insert, update, delete on table public.messages to authenticated;

-- Identity / serial sequences used by inserts under the authenticated role.
do $$
declare
  seq regclass;
begin
  for seq in
    select pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname)::regclass
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public'
      and c.relname in ('items', 'kitchen_tools', 'conversations', 'messages')
      and pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) is not null
  loop
    execute format('grant usage, select on sequence %s to authenticated', seq);
    execute format('revoke all on sequence %s from anon', seq);
  end loop;
end $$;
