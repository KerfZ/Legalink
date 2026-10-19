-- Legal!nk V1 — run this in a BRAND-NEW Supabase project > SQL Editor
-- Flow: user logs in -> describes case (saved to cases) -> filters firms -> views firm contact + history

-- 1) profiles: extends auth.users, controls admin access for dashboard
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'client' check (role in ('client','admin')),
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;

-- 2) firms: starts EMPTY, you add via /dashboard
create table public.firms (
  id bigint generated always as identity primary key,
  name text not null,
  initials text not null default 'L',
  practice_area text not null,
  complexity text not null check (complexity in ('Low','Medium','High')),
  price_min integer not null check (price_min >= 0),
  price_max integer not null check (price_max >= price_min),
  description text not null default '',
  tags text[] not null default '{}',
  history text not null default '',
  contact_name text default '',
  contact_email text default '',
  contact_phone text default '',
  is_published boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
alter table public.firms enable row level security;

-- 3) cases: saved from /start-case, login required
create table public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text default '',
  legal_need text not null,
  complexity text not null,
  budget_range text not null,
  details text default '',
  created_at timestamptz default now()
);
alter table public.cases enable row level security;

-- 4) auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- 5) public view WITHOUT contact info (for logged-out / list safety)
create or replace view public.public_firms as
select id, name, initials, practice_area, complexity, price_min, price_max,
       description, tags, history, is_published, created_at
from public.firms
where is_published = true;

-- 6) RLS policies
-- profiles: users read/update own, admins read all
create policy "users read own profile"
  on public.profiles for select to authenticated using (auth.uid() = id);
create policy "users update own profile"
  on public.profiles for update to authenticated using (auth.uid() = id);

-- firms: any logged-in user can read published firms (contact included — route is login-gated).
-- anon sees nothing via table (must use public_firms view via anon? we keep list login-gated so deny anon).
create policy "authenticated read published firms"
  on public.firms for select to authenticated using (is_published = true);
-- admins full write (checks profiles.role)
create policy "admins insert firms"
  on public.firms for insert to authenticated
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
create policy "admins update firms"
  on public.firms for update to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
create policy "admins delete firms"
  on public.firms for delete to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- cases: owner can insert + read own; admins read all
create policy "users insert own cases"
  on public.cases for insert to authenticated with check (auth.uid() = user_id);
create policy "users read own cases"
  on public.cases for select to authenticated using (auth.uid() = user_id);
create policy "admins read all cases"
  on public.cases for select to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- grants (needed for RLS + PostgREST)
grant select on public.public_firms to anon, authenticated;
grant all on public.firms to authenticated;
grant all on public.cases to authenticated;
grant all on public.profiles to authenticated;

-- 7) AFTER running: make yourself admin (replace with your login email's user id):
--   1. Sign up once in the app, then in Supabase > Authentication > Users copy your UUID
--   2. Run: update public.profiles set role = 'admin' where id = 'PASTE-UUID-HERE';
