-- Legal!nk V2 migration â€” run ONCE in Supabase SQL Editor on the live DB.
-- Adds: firm role + firm onboarding fields, case intake v2 fields,
--       booking/counter-offer engine, transactions (20% platform fee),
--       document vault, verified client reviews + firm_ratings view.

-- 1) profiles: allow the 'firm' provider role.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('client','firm','admin'));

-- 2) firms: onboarding fields for self-serve law firms.
alter table public.firms
  add column if not exists owner_id uuid references auth.users(id) on delete set null,
  add column if not exists area text not null default '',
  add column if not exists office_address text not null default '',
  add column if not exists logo_url text,
  add column if not exists google_rating numeric(2,1),
  add column if not exists is_featured boolean not null default false,
  add column if not exists is_published boolean not null default true;
-- New firm-submitted listings start UNPUBLISHED until an admin reviews them.
-- (Admin-created rows from the dashboard keep is_published = true.)

-- 3) cases (case intake) v2 fields.
alter table public.cases
  add column if not exists severity text not null default 'Medium'
    check (severity in ('Low','Medium','High')),
  add column if not exists preferred_time timestamptz,
  add column if not exists mode text not null default 'ONLINE'
    check (mode in ('ONLINE','OFFLINE'));
-- Backfill severity from the old free-text complexity, then drop the legacy
-- V1 column. It is NOT NULL without a default, so leaving it in place breaks
-- V2 inserts (which send `severity`, not `complexity`). Guarded so the whole
-- migration can be re-run safely.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cases' and column_name = 'complexity'
  ) then
    update public.cases
       set severity = case
         when complexity like 'Low%' then 'Low'
         when complexity like 'Medium%' then 'Medium'
         when complexity like 'High%' then 'High'
         else 'Medium'
       end;
    alter table public.cases drop column complexity;
  end if;
end $$;

-- 4) booking_offers: request & counter-offer negotiation engine.
create table if not exists public.booking_offers (
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
create index if not exists booking_offers_client_idx on public.booking_offers (client_id, created_at desc);
create index if not exists booking_offers_firm_idx on public.booking_offers (firm_id, created_at desc);

-- 5) transactions: Virtual Account / QRIS payments with 20% platform fee.
create table if not exists public.transactions (
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
create index if not exists transactions_client_idx on public.transactions (client_id, created_at desc);

-- 6) case_documents: post-payment document vault.
create table if not exists public.case_documents (
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
create index if not exists case_documents_booking_idx on public.case_documents (booking_offer_id);

-- 7) reviews: verified Legal!nk client reviews (only after a SUCCESS payment).
create table if not exists public.reviews (
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

-- 9) RLS â€” firms: firm owners manage their own listing; everyone reads published.
drop policy if exists "owners read own firms" on public.firms;
create policy "owners read own firms"
  on public.firms for select to authenticated
  using (owner_id = auth.uid());
drop policy if exists "owners update own firms" on public.firms;
create policy "owners update own firms"
  on public.firms for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
drop policy if exists "firms insert own listing" on public.firms;
create policy "firms insert own listing"
  on public.firms for insert to authenticated
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'firm')
    and is_published = false  -- admin must approve before public listing
  );

-- booking_offers: client creates requests; firm responds; both may read.
drop policy if exists "clients create booking requests" on public.booking_offers;
create policy "clients create booking requests"
  on public.booking_offers for insert to authenticated
  with check (client_id = auth.uid() and status = 'PENDING');
drop policy if exists "parties read their bookings" on public.booking_offers;
create policy "parties read their bookings"
  on public.booking_offers for select to authenticated
  using (
    client_id = auth.uid()
    or exists (select 1 from public.firms f where f.id = firm_id and f.owner_id = auth.uid())
  );
drop policy if exists "firms respond to bookings" on public.booking_offers;
create policy "firms respond to bookings"
  on public.booking_offers for update to authenticated
  using (exists (select 1 from public.firms f where f.id = firm_id and f.owner_id = auth.uid()))
  with check (exists (select 1 from public.firms f where f.id = firm_id and f.owner_id = auth.uid()));
drop policy if exists "clients decide on offers" on public.booking_offers;
create policy "clients decide on offers"
  on public.booking_offers for update to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());
drop policy if exists "admins read all bookings" on public.booking_offers;
create policy "admins read all bookings"
  on public.booking_offers for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- transactions: client reads own; client creates on accepted offers; webhook flips status.
drop policy if exists "clients read own transactions" on public.transactions;
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
drop policy if exists "clients create transactions" on public.transactions;
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
drop policy if exists "admins read all transactions" on public.transactions;
create policy "admins read all transactions"
  on public.transactions for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
-- NOTE: payment_status flips are done by the service-role client in
-- /api/payments/webhook, which bypasses RLS. No UPDATE policy for anon/auth.

-- case_documents: uploader writes; client + firm of the booking read.
drop policy if exists "uploaders insert documents" on public.case_documents;
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
drop policy if exists "parties read documents" on public.case_documents;
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
drop policy if exists "uploaders delete documents" on public.case_documents;
create policy "uploaders delete documents"
  on public.case_documents for delete to authenticated
  using (uploader_id = auth.uid());

-- reviews: only clients with a SUCCESS transaction may review; public read.
drop policy if exists "verified clients review" on public.reviews;
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
drop policy if exists "anyone reads reviews" on public.reviews;
create policy "anyone reads reviews"
  on public.reviews for select to authenticated
  using (true);

-- 10) Storage bucket for the document vault (PDFs/images only, enforced in app).
insert into storage.buckets (id, name, public)
values ('case-documents', 'case-documents', false)
on conflict (id) do nothing;

drop policy if exists "vault upload" on storage.objects;
create policy "vault upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'case-documents');
drop policy if exists "vault read" on storage.objects;
create policy "vault read"
  on storage.objects for select to authenticated
  using (bucket_id = 'case-documents');
drop policy if exists "vault delete" on storage.objects;
create policy "vault delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'case-documents');

-- 11) Grants
grant select on public.firm_ratings to authenticated;
grant all on public.booking_offers to authenticated;
grant all on public.transactions to authenticated;
grant all on public.case_documents to authenticated;
grant all on public.reviews to authenticated;

-- 12) Promote a user to firm admin (or use the firm onboarding flow which
--     auto-sets role='firm' on first sign-in via the onboarding page):
-- update public.profiles set role = 'firm' where id = 'PASTE-USER-UUID';