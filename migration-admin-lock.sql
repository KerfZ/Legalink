-- Migration: admin lock for LIVE rhea-sooty DB (run once in Supabase SQL Editor)
-- 1) New users already default to 'client' via column default. Force any NULLs:
update public.profiles set role = 'client' where role is null;

-- 2) Replace self-update policy with display_name-only (role guarded by trigger)
drop policy if exists "users update own profile" on public.profiles;
drop policy if exists "users update own display_name" on public.profiles;
create policy "users update own display_name"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 3) Prevent role escalation
create or replace function public.prevent_role_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  caller_role text;
begin
  if old.role = new.role then
    return new;
  end if;
  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role = 'admin' then
    return new;
  end if;
  raise exception 'Only admins can change roles.';
end;
$$;
drop trigger if exists prevent_role_escalation on public.profiles;
create trigger prevent_role_escalation
  before update of role on public.profiles
  for each row execute function public.prevent_role_escalation();

-- 4) Promote / demote (run separately with real UUIDs):
-- update public.profiles set role = 'admin' where id = 'PASTE-ADMIN-UUID';
-- update public.profiles set role = 'client' where id = 'PASTE-USER-UUID';
