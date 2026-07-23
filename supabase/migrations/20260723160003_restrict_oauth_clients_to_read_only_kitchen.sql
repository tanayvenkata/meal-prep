-- Make the database capability match Mise's read-only OAuth consent.
--
-- Supabase OAuth scopes control OIDC profile data, not Data API permissions.
-- OAuth access tokens still use the authenticated Postgres role and include a
-- client_id claim. The previous FOR ALL ownership policies therefore allowed
-- any holder of a linked OAuth token to write directly through PostgREST even
-- though the MCP server exposed only a read tool.
--
-- Direct Supabase sessions do not carry client_id. Mise's server-side
-- withUserContext path also deliberately stamps only the trusted user sub
-- before SET ROLE authenticated. Those paths retain owned-row writes. An OAuth
-- token presented directly to the Data API may read owned kitchen context but
-- cannot mutate kitchen rows or access chat history.

-- ---------------------------------------------------------------------------
-- Pantry: every authenticated user context can read its own rows. Only direct
-- sessions / Mise's server boundary (no OAuth client_id) can mutate them.
-- ---------------------------------------------------------------------------
drop policy if exists "items_user_isolation" on public.items;

create policy "items_select_owned"
on public.items
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "items_insert_owned_non_oauth"
on public.items
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and ((select auth.jwt()) ->> 'client_id') is null
);

create policy "items_update_owned_non_oauth"
on public.items
for update
to authenticated
using (
  (select auth.uid()) = user_id
  and ((select auth.jwt()) ->> 'client_id') is null
)
with check (
  (select auth.uid()) = user_id
  and ((select auth.jwt()) ->> 'client_id') is null
);

create policy "items_delete_owned_non_oauth"
on public.items
for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and ((select auth.jwt()) ->> 'client_id') is null
);

-- ---------------------------------------------------------------------------
-- Kitchen tools: same read-only OAuth rule as pantry items.
-- ---------------------------------------------------------------------------
drop policy if exists "kitchen_tools_user_isolation" on public.kitchen_tools;

create policy "kitchen_tools_select_owned"
on public.kitchen_tools
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "kitchen_tools_insert_owned_non_oauth"
on public.kitchen_tools
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and ((select auth.jwt()) ->> 'client_id') is null
);

create policy "kitchen_tools_update_owned_non_oauth"
on public.kitchen_tools
for update
to authenticated
using (
  (select auth.uid()) = user_id
  and ((select auth.jwt()) ->> 'client_id') is null
)
with check (
  (select auth.uid()) = user_id
  and ((select auth.jwt()) ->> 'client_id') is null
);

create policy "kitchen_tools_delete_owned_non_oauth"
on public.kitchen_tools
for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and ((select auth.jwt()) ->> 'client_id') is null
);

-- ---------------------------------------------------------------------------
-- Chat data is not part of the MCP consent. OAuth-client tokens receive no
-- direct access. Website and server-side behavior remain user-owned.
-- ---------------------------------------------------------------------------
drop policy if exists "conversations_user_isolation" on public.conversations;

create policy "conversations_select_owned_non_oauth"
on public.conversations
for select
to authenticated
using (
  (select auth.uid()) = user_id
  and ((select auth.jwt()) ->> 'client_id') is null
);

create policy "conversations_insert_owned_non_oauth"
on public.conversations
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and ((select auth.jwt()) ->> 'client_id') is null
);

create policy "conversations_update_owned_non_oauth"
on public.conversations
for update
to authenticated
using (
  (select auth.uid()) = user_id
  and ((select auth.jwt()) ->> 'client_id') is null
)
with check (
  (select auth.uid()) = user_id
  and ((select auth.jwt()) ->> 'client_id') is null
);

create policy "conversations_delete_owned_non_oauth"
on public.conversations
for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and ((select auth.jwt()) ->> 'client_id') is null
);

drop policy if exists "messages_via_conversation_owner" on public.messages;

create policy "messages_select_owned_non_oauth"
on public.messages
for select
to authenticated
using (
  ((select auth.jwt()) ->> 'client_id') is null
  and exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and c.user_id = (select auth.uid())
  )
);

create policy "messages_insert_owned_non_oauth"
on public.messages
for insert
to authenticated
with check (
  ((select auth.jwt()) ->> 'client_id') is null
  and exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and c.user_id = (select auth.uid())
  )
);

create policy "messages_update_owned_non_oauth"
on public.messages
for update
to authenticated
using (
  ((select auth.jwt()) ->> 'client_id') is null
  and exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and c.user_id = (select auth.uid())
  )
)
with check (
  ((select auth.jwt()) ->> 'client_id') is null
  and exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and c.user_id = (select auth.uid())
  )
);

create policy "messages_delete_owned_non_oauth"
on public.messages
for delete
to authenticated
using (
  ((select auth.jwt()) ->> 'client_id') is null
  and exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and c.user_id = (select auth.uid())
  )
);
