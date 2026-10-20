-- Legal!nk V3 migration - run ONCE in Supabase SQL Editor on the live DB.
-- Adds: client full name + phone at sign-up (spec 2A), firm operating hours,
--       map coordinates for Google Maps links, firm logo storage bucket,
--       credential verification (is_verified) with self-verification guard,
--       and review editing.
-- For a BRAND-NEW database, run schema.sql instead (already includes these).

-- 1) profiles: client contact fields from spec (full government name, phone/WhatsApp).
alter table public.profiles
  add column if not exists full_name text not null default '',
  add column if not exists phone text not null default '';

-- 2) firms: operating hours, map coordinates, credential verification.
alter table public.firms
  add column if not exists operating_hours text not null default '',
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists is_verified boolean not null default false,
  add column if not exists credentials_url text;

-- 3) handle_new_user: copy full name + phone from sign-up metadata into profiles.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  intended_role text;
  meta_name text;
begin
  -- Role comes from sign-up metadata (account_role set by the sign-up form).
  -- Only 'client' and 'firm' can ever be self-selected - 'admin' can only be
  -- granted manually by an existing admin.
  intended_role := coalesce(new.raw_user_meta_data ->> 'account_role', 'client');
  if intended_role not in ('client', 'firm') then
    intended_role := 'client';
  end if;
  meta_name := coalesce(new.raw_user_meta_data ->> 'full_name', '');
  insert into public.profiles (id, display_name, full_name, phone, role)
  values (
    new.id,
    case when meta_name <> '' then meta_name else split_part(new.email, '@', 1) end,
    meta_name,
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    intended_role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 4) Only admins may verify firms. Without this guard the "owners update own
--    firms" RLS policy would let a firm owner set is_verified = true themselves.
create or replace function public.prevent_self_verification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  caller_role text;
begin
  if auth.uid() is null then
    return new; -- service role / SQL editor / server webhooks
  end if;
  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role = 'admin' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_verified := false; -- firms can never self-verify on insert
    return new;
  end if;
  if old.is_verified is distinct from new.is_verified then
    raise exception 'Only admins can change verification status.';
  end if;
  return new;
end;
$$;
drop trigger if exists prevent_self_verification on public.firms;
create trigger prevent_self_verification
  before insert or update on public.firms
  for each row execute function public.prevent_self_verification();

-- 5) reviews: reviewers may edit their own review (rating / comment).
drop policy if exists "reviewers update own reviews" on public.reviews;
create policy "reviewers update own reviews"
  on public.reviews for update to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

-- 6) Storage bucket for firm logos + credential documents.
--    Users may only write inside their own folder: {user_id}/...
insert into storage.buckets (id, name, public)
values ('firm-logos', 'firm-logos', true)
on conflict (id) do nothing;
drop policy if exists "firm logos public read" on storage.objects;
create policy "firm logos public read" on storage.objects
  for select using (bucket_id = 'firm-logos');
drop policy if exists "firm logos own folder upload" on storage.objects;
create policy "firm logos own folder upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'firm-logos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "firm logos own folder update" on storage.objects;
create policy "firm logos own folder update" on storage.objects
  for update to authenticated
  using (bucket_id = 'firm-logos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "firm logos own folder delete" on storage.objects;
create policy "firm logos own folder delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'firm-logos' and (storage.foldername(name))[1] = auth.uid()::text);

-- 7) Existing rows simply keep the defaults ('', false, null) - no backfill needed.
