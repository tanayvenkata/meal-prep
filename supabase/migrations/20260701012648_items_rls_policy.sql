-- Real RLS enforcement for items (issue #20). db.ts impersonates the
-- `authenticated` role per request (see withUserContext in src/lib/db.ts),
-- so this policy actually applies -- unlike the raw `postgres` connection
-- role, which owns the table and bypasses RLS regardless of policies.
-- No FORCE ROW LEVEL SECURITY: FORCE only overrides owner bypass, and
-- `authenticated` is not the owner, so ordinary RLS already applies to it.
create policy "items_user_isolation"
on public.items
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
