-- Legal!nk V2 â€” run this in a BRAND-NEW Supabase project > SQL Editor
-- Flow: signup (client | firm) -> multi-step case intake -> recommended firms
--   -> booking request -> firm counter-offer -> accept -> VA/QRIS checkout
--   -> document vault unlocked on PAID -> verified client review.
-- For an existing V1 database, run migration-v2.sql instead.

-- 1) profiles: extends auth.users, controls role & dashboard access.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  full_name text not null default '',
  phone text not null default '',
  role text not null default 'client' check (role in ('client','firm','admin')),
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;

-- 2) firms: admin-curated OR firm-self-onboarded listings.
create table public.firms (
  id bigint generated always as identity primary key,
  owner_id uuid references auth.users(id) on delete set null,
  name text not null,
  initials text not null default 'L',
  practice_area text not null,
  complexity text not null check (complexity in ('Low','Medium','High')),
  price_min integer not null check (price_min >= 0),
  price_max integer not null check (price_max >= price_min),
  description text not null default '',
  tags text[] not null default '{}',
  history text not null default '',
  area text not null default '',
  office_address text not null default '',
  logo_url text,
  google_rating numeric(2,1) check (google_rating is null or (google_rating >= 0 and google_rating <= 5)),
  is_featured boolean not null default false,
  operating_hours text not null default '',
  lat double precision,
  lng double precision,
  is_verified boolean not null default false,
  credentials_url text,
  contact_name text default '',
  contact_email text default '',
  contact_phone text default '',
  is_published boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
alter table public.firms enable row level security;

-- 3) cases: multi-step intake from /start-case.
create table public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text default '',
  legal_need text not null,
  severity text not null default 'Medium' check (severity in ('Low','Medium','High')),
  budget_range text not null check (budget_range in ('lt1m','1m-3m','3m-5m','gt5m')),
  details text default '',
  preferred_time timestamptz,
  mode text not null default 'ONLINE' check (mode in ('ONLINE','OFFLINE')),
  created_at timestamptz default now()
);
alter table public.cases enable row level security;

-- 4) booking_offers: request & counter-offer negotiation engine.
create table public.booking_offers (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  firm_id bigint not null references public.firms(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'PENDING'
    check (status in ('PENDING','OFFER_SENT','ACCEPTED','REJECTED')),
  offered_time timestamptz,
  offered_price integer check (offered_price is null or offered_price >= 0),
  meeting_details text not null default '',
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
alter table public.booking_offers enable row level security;
create index booking_offers_client_idx on public.booking_offers (client_id, created_at desc);
create index booking_offers_firm_idx on public.booking_offers (firm_id, created_at desc);

-- 5) transactions: VA/QRIS payments with a 20% platform fee.
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  booking_offer_id uuid not null unique references public.booking_offers(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  total_amount integer not null check (total_amount >= 0),
  platform_fee_amount integer not null default 0 check (platform_fee_amount >= 0),
  firm_payout_amount integer not null default 0 check (firm_payout_amount >= 0),
  payment_method text not null default 'VA' check (payment_method in ('VA','QRIS')),
  bank text check (bank is null or bank in ('BCA','Mandiri','BRI','BNI')),
  virtual_account_no text,
  payment_status text not null default 'PENDING'
    check (payment_status in ('PENDING','SUCCESS','FAILED')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.transactions enable row level security;
create index transactions_client_idx on public.transactions (client_id, created_at desc);

-- 6) case_documents: post-payment document vault.
create table public.case_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  booking_offer_id uuid not null references public.booking_offers(id) on delete cascade,
  uploader_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes integer,
  created_at timestamptz not null default now()
);
alter table public.case_documents enable row level security;
create index case_documents_booking_idx on public.case_documents (booking_offer_id);

-- 7) reviews: verified Legal!nk client reviews (only after a SUCCESS payment).
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  firm_id bigint not null references public.firms(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  booking_offer_id uuid not null unique references public.booking_offers(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now()
);
alter table public.reviews enable row level security;

-- 8) firm_ratings: aggregated Google + verified in-house rating per firm.
create or replace view public.firm_ratings
with (security_invoker = on) as
select
  f.id as firm_id,
  f.google_rating,
  coalesce(round(avg(r.rating)::numeric, 1), null) as in_house_rating,
  count(r.id)::int as review_count
from public.firms f
left join public.reviews r on r.firm_id = f.id
group by f.id, f.google_rating;

-- 9) auto-create profile on signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  intended_role text;
  meta_name text;
begin
  -- Role comes from sign-up metadata (account_role set by the sign-up form).
  -- Only 'client' and 'firm' can ever be self-selected — 'admin' can only be
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
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- 10) RLS â€” profiles: users read own; update own display_name only (role locked).
create policy "users read own profile"
  on public.profiles for select to authenticated using (auth.uid() = id);
create policy "users update own display_name"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- firms: everyone authenticated reads published; owners read own (even unpublished);
-- admins full write.
create policy "authenticated read published firms"
  on public.firms for select to authenticated using (is_published = true);
create policy "owners read own firms"
  on public.firms for select to authenticated
  using (owner_id = auth.uid());
create policy "owners update own firms"
  on public.firms for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
create policy "firms insert own listing"
  on public.firms for insert to authenticated
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'firm')
    and is_published = false
  );
create policy "admins insert firms"
  on public.firms for insert to authenticated
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
create policy "admins update firms"
  on public.firms for update to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
create policy "admins delete firms"
  on public.firms for delete to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- cases: owner can insert + read own; admins read all.
create policy "users insert own cases"
  on public.cases for insert to authenticated with check (auth.uid() = user_id);
create policy "users read own cases"
  on public.cases for select to authenticated using (auth.uid() = user_id);
create policy "admins read all cases"
  on public.cases for select to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- booking_offers.
create policy "clients create booking requests"
  on public.booking_offers for insert to authenticated
  with check (client_id = auth.uid() and status = 'PENDING');
create policy "parties read their bookings"
  on public.booking_offers for select to authenticated
  using (
    client_id = auth.uid()
    or exists (select 1 from public.firms f where f.id = firm_id and f.owner_id = auth.uid())
  );
create policy "firms respond to bookings"
  on public.booking_offers for update to authenticated
  using (exists (select 1 from public.firms f where f.id = firm_id and f.owner_id = auth.uid()))
  with check (exists (select 1 from public.firms f where f.id = firm_id and f.owner_id = auth.uid()));
create policy "clients decide on offers"
  on public.booking_offers for update to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());
create policy "admins read all bookings"
  on public.booking_offers for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- transactions.
create policy "clients read own transactions"
  on public.transactions for select to authenticated
  using (
    client_id = auth.uid()
    or exists (
      select 1 from public.booking_offers bo
      join public.firms f on f.id = bo.firm_id
      where bo.id = booking_offer_id and f.owner_id = auth.uid()
    )
  );
create policy "clients create transactions"
  on public.transactions for insert to authenticated
  with check (
    client_id = auth.uid()
    and payment_status = 'PENDING'
    and exists (
      select 1 from public.booking_offers bo
      where bo.id = booking_offer_id
        and bo.client_id = auth.uid()
        and bo.status = 'ACCEPTED'
    )
  );
create policy "admins read all transactions"
  on public.transactions for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
-- payment_status flips happen via the service-role client in /api/payments/webhook (bypasses RLS).

-- case_documents.
create policy "uploaders insert documents"
  on public.case_documents for insert to authenticated
  with check (
    uploader_id = auth.uid()
    and exists (
      select 1 from public.booking_offers bo
      where bo.id = booking_offer_id
        and bo.client_id = auth.uid()
        and bo.status = 'ACCEPTED'
        and exists (
          select 1 from public.transactions t
          where t.booking_offer_id = bo.id and t.payment_status = 'SUCCESS'
        )
    )
  );
create policy "parties read documents"
  on public.case_documents for select to authenticated
  using (
    uploader_id = auth.uid()
    or exists (
      select 1 from public.booking_offers bo
      join public.firms f on f.id = bo.firm_id
      where bo.id = booking_offer_id
        and (bo.client_id = auth.uid() or f.owner_id = auth.uid())
    )
  );
create policy "uploaders delete documents"
  on public.case_documents for delete to authenticated
  using (uploader_id = auth.uid());

-- reviews.
create policy "verified clients review"
  on public.reviews for insert to authenticated
  with check (
    client_id = auth.uid()
    and exists (
      select 1 from public.booking_offers bo
      where bo.id = booking_offer_id
        and bo.client_id = auth.uid()
        and bo.firm_id = firm_id
        and exists (
          select 1 from public.transactions t
          where t.booking_offer_id = bo.id and t.payment_status = 'SUCCESS'
        )
    )
  );
create policy "anyone reads reviews"
  on public.reviews for select to authenticated
  using (true);
create policy "reviewers update own reviews"
  on public.reviews for update to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

-- 11) Storage bucket for the document vault (PDFs/images enforced in app code).
insert into storage.buckets (id, name, public)
values ('case-documents', 'case-documents', false)
on conflict (id) do nothing;
create policy "vault upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'case-documents');
create policy "vault read" on storage.objects for select to authenticated
  using (bucket_id = 'case-documents');
create policy "vault delete" on storage.objects for delete to authenticated
  using (bucket_id = 'case-documents');

-- 11b) Storage bucket for firm logos + credential documents (public read;
--      writes restricted to the uploader's own folder: {user_id}/...).
insert into storage.buckets (id, name, public)
values ('firm-logos', 'firm-logos', true)
on conflict (id) do nothing;
create policy "firm logos public read" on storage.objects
  for select using (bucket_id = 'firm-logos');
create policy "firm logos own folder upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'firm-logos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "firm logos own folder update" on storage.objects
  for update to authenticated
  using (bucket_id = 'firm-logos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "firm logos own folder delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'firm-logos' and (storage.foldername(name))[1] = auth.uid()::text);

-- 12) grants (needed for RLS + PostgREST).
grant select on public.firm_ratings to authenticated;
grant all on public.firms to authenticated;
grant all on public.cases to authenticated;
grant all on public.profiles to authenticated;
grant all on public.booking_offers to authenticated;
grant all on public.transactions to authenticated;
grant all on public.case_documents to authenticated;
grant all on public.reviews to authenticated;

-- 13) Prevent role escalation: users cannot make themselves admin/firm.
-- Only an existing admin can change someone's role.
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

-- 14) Prevent self-verification: only admins can change firms.is_verified.
--     (Otherwise the "owners update own firms" policy would let a firm grant
--     itself the Verified badge.)
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

-- 15) AFTER running: make yourself admin (replace with your login user id):
--   1. Sign up once in the app, then in Supabase > Authentication > Users copy your UUID
--   2. Run: update public.profiles set role = 'admin' where id = 'PASTE-UUID-HERE';
-- To onboard as a law firm instead: sign up with "Law firm" selected on /auth/sign-up,
-- then complete /firm/onboarding.