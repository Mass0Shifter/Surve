-- NSurvey PRO — initial backend schema
-- Run in the Supabase SQL editor (or `supabase db push`).
-- Accounts come from Supabase Auth (auth.users). Billing fields are writable
-- only by the server (service_role) after a verified Paystack payment.

create extension if not exists pgcrypto;

-- ─── Profiles ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  title text default 'Surv.',
  surcon_number text,
  nis_chapter text,
  phone text,
  company_name text,
  office_address text,
  avatar_url text,
  digital_seal_url text,
  signature_url text,
  subscription_tier text not null default 'COMMUNITY'
    check (subscription_tier in ('COMMUNITY','PROFESSIONAL','ENTERPRISE')),
  subscription_expires_at timestamptz,
  active_organization_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Users may never change their own billing fields or email.
create or replace function public.protect_profile_billing()
returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    new.subscription_tier := old.subscription_tier;
    new.subscription_expires_at := old.subscription_expires_at;
    new.email := old.email;
    new.id := old.id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_protect_billing on public.profiles;
create trigger profiles_protect_billing
  before update on public.profiles
  for each row execute function public.protect_profile_billing();

-- ─── Organizations ───────────────────────────────────────────────────────────
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  firm_logo_url text,
  official_seal_url text,
  office_address text,
  phone text,
  email text,
  default_grid_belt numeric not null default 8.5,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,  -- null = pending invite
  email text not null,
  full_name text not null default '',
  title text,
  surcon_number text,
  role text not null check (role in ('OWNER','ADMIN','SURVEYOR','VIEWER')),
  joined_at timestamptz not null default now(),
  unique (organization_id, email)
);

create index if not exists org_members_user_idx on public.organization_members(user_id);
create index if not exists org_members_email_idx on public.organization_members(lower(email));

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

create or replace function public.is_org_member(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_members m
    where m.organization_id = org and m.user_id = auth.uid()
  );
$$;

create or replace function public.org_role(org uuid)
returns text language sql stable security definer set search_path = public as $$
  select m.role from organization_members m
  where m.organization_id = org and m.user_id = auth.uid()
  limit 1;
$$;

drop policy if exists "orgs: members read" on public.organizations;
create policy "orgs: members read" on public.organizations
  for select using (public.is_org_member(id));

drop policy if exists "org members: members read" on public.organization_members;
create policy "org members: members read" on public.organization_members
  for select using (public.is_org_member(organization_id));

-- All org writes go through the security-definer functions below.

create or replace function public.org_seat_limit(org uuid)
returns int language sql stable security definer set search_path = public as $$
  select case
    when p.subscription_tier = 'ENTERPRISE'
      and (p.subscription_expires_at is null or p.subscription_expires_at > now()) then 20
    when p.subscription_tier = 'PROFESSIONAL'
      and (p.subscription_expires_at is null or p.subscription_expires_at > now()) then 3
    else 1 end
  from organizations o join profiles p on p.id = o.owner_user_id
  where o.id = org;
$$;

create or replace function public.create_organization(
  p_name text, p_slug text, p_office_address text, p_phone text, p_email text, p_grid_belt numeric
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  new_id uuid;
begin
  select * into me from profiles where id = auth.uid();
  if me.id is null then raise exception 'Not signed in'; end if;
  if me.subscription_tier = 'COMMUNITY'
     or (me.subscription_expires_at is not null and me.subscription_expires_at < now()) then
    raise exception 'Creating an organization requires an active Professional or Enterprise subscription.';
  end if;
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'Organization name is required.'; end if;

  insert into organizations(name, slug, owner_user_id, office_address, phone, email, default_grid_belt)
  values (trim(p_name), p_slug, me.id,
          coalesce(nullif(trim(p_office_address),''), me.office_address),
          coalesce(nullif(trim(p_phone),''), me.phone),
          coalesce(nullif(trim(p_email),''), me.email),
          coalesce(p_grid_belt, 8.5))
  returning id into new_id;

  insert into organization_members(organization_id, user_id, email, full_name, title, surcon_number, role)
  values (new_id, me.id, me.email, me.full_name, me.title, me.surcon_number, 'OWNER');

  update profiles set active_organization_id = new_id where id = me.id;
  return new_id;
exception when unique_violation then
  raise exception 'An organization with the identifier "%" already exists. Choose a different name.', p_slug;
end $$;

create or replace function public.invite_org_member(
  p_org uuid, p_email text, p_full_name text, p_role text, p_title text, p_surcon text
) returns void language plpgsql security definer set search_path = public as $$
declare
  r text := public.org_role(p_org);
  used int;
  existing uuid;
  e text := lower(trim(p_email));
begin
  if r is null or r not in ('OWNER','ADMIN') then
    raise exception 'Only organization Owners or Admins can invite team members.';
  end if;
  if p_role not in ('ADMIN','SURVEYOR','VIEWER') then raise exception 'Invalid role.'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address.'; end if;
  select count(*) into used from organization_members where organization_id = p_org;
  if used >= public.org_seat_limit(p_org) then
    raise exception 'Seat limit reached (% of % seats used). Upgrade the owner''s plan to add more members.',
      used, public.org_seat_limit(p_org);
  end if;
  select id into existing from auth.users where lower(email) = e;
  insert into organization_members(organization_id, user_id, email, full_name, title, surcon_number, role)
  values (p_org, existing, e, trim(coalesce(p_full_name,'')), coalesce(p_title,'Surv.'), nullif(trim(p_surcon),''), p_role);
exception when unique_violation then
  raise exception 'A member with email "%" is already part of this organization.', e;
end $$;

create or replace function public.remove_org_member(p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m organization_members;
begin
  select * into m from organization_members where id = p_member;
  if m.id is null then raise exception 'Member not found.'; end if;
  if m.role = 'OWNER' then raise exception 'The organization owner cannot be removed.'; end if;
  if coalesce(public.org_role(m.organization_id), '') not in ('OWNER','ADMIN')
     and m.user_id is distinct from auth.uid() then
    raise exception 'Only organization Owners or Admins can remove members.';
  end if;
  delete from organization_members where id = p_member;
  update profiles set active_organization_id = null
   where id = m.user_id and active_organization_id = m.organization_id;
end $$;

create or replace function public.update_org_member_role(p_member uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare m organization_members;
begin
  select * into m from organization_members where id = p_member;
  if m.id is null then raise exception 'Member not found.'; end if;
  if public.org_role(m.organization_id) is distinct from 'OWNER' then
    raise exception 'Only the organization owner can change member roles.';
  end if;
  if m.role = 'OWNER' or p_role not in ('ADMIN','SURVEYOR','VIEWER') then
    raise exception 'Invalid role change.';
  end if;
  update organization_members set role = p_role where id = p_member;
end $$;

create or replace function public.update_organization(
  p_org uuid, p_name text, p_office_address text, p_phone text, p_email text,
  p_grid_belt numeric, p_logo text, p_seal text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.org_role(p_org), '') not in ('OWNER','ADMIN') then
    raise exception 'Only organization Owners or Admins can update firm details.';
  end if;
  update organizations set
    name = coalesce(nullif(trim(p_name),''), name),
    office_address = coalesce(p_office_address, office_address),
    phone = coalesce(p_phone, phone),
    email = coalesce(p_email, email),
    default_grid_belt = coalesce(p_grid_belt, default_grid_belt),
    firm_logo_url = coalesce(p_logo, firm_logo_url),
    official_seal_url = coalesce(p_seal, official_seal_url)
  where id = p_org;
end $$;

-- Claim pending invites addressed to the signed-in user's email.
create or replace function public.claim_org_invites()
returns int language plpgsql security definer set search_path = public as $$
declare n int; e text;
begin
  select lower(email) into e from auth.users where id = auth.uid();
  update organization_members set user_id = auth.uid(), joined_at = now()
   where user_id is null and lower(email) = e;
  get diagnostics n = row_count;
  return n;
end $$;

-- Only allow active_organization_id to point at an org the user belongs to.
create or replace function public.check_active_org()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.active_organization_id is not null and not exists (
    select 1 from organization_members
    where organization_id = new.active_organization_id and user_id = new.id
  ) then
    new.active_organization_id := null;
  end if;
  return new;
end $$;

drop trigger if exists profiles_check_active_org on public.profiles;
create trigger profiles_check_active_org
  before insert or update of active_organization_id on public.profiles
  for each row execute function public.check_active_org();

-- ─── Payments ────────────────────────────────────────────────────────────────
create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null,
  tier text not null,
  frequency text not null check (frequency in ('monthly','annual')),
  amount numeric not null,            -- major units (e.g. NGN)
  currency text not null,
  gateway text not null default 'paystack',
  status text not null default 'PENDING' check (status in ('PENDING','SUCCESS','FAILED')),
  receipt_number text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists payment_tx_user_idx on public.payment_transactions(user_id, created_at desc);

alter table public.payment_transactions enable row level security;

drop policy if exists "tx: read own" on public.payment_transactions;
create policy "tx: read own" on public.payment_transactions
  for select using (auth.uid() = user_id);
-- Inserts/updates only via service_role (server functions).

-- ─── New-user bootstrap ──────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, email, full_name, title, surcon_number, nis_chapter, phone, company_name)
  values (
    new.id, lower(new.email),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'title', 'Surv.'),
    new.raw_user_meta_data->>'surcon_number',
    new.raw_user_meta_data->>'nis_chapter',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'company_name'
  ) on conflict (id) do nothing;
  update organization_members set user_id = new.id
   where user_id is null and lower(email) = lower(new.email);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Lock down function execution to signed-in users.
revoke execute on function public.create_organization(text,text,text,text,text,numeric) from public, anon;
revoke execute on function public.invite_org_member(uuid,text,text,text,text,text) from public, anon;
revoke execute on function public.remove_org_member(uuid) from public, anon;
revoke execute on function public.update_org_member_role(uuid,text) from public, anon;
revoke execute on function public.update_organization(uuid,text,text,text,text,numeric,text,text) from public, anon;
revoke execute on function public.claim_org_invites() from public, anon;
grant execute on function public.create_organization(text,text,text,text,text,numeric) to authenticated;
grant execute on function public.invite_org_member(uuid,text,text,text,text,text) to authenticated;
grant execute on function public.remove_org_member(uuid) to authenticated;
grant execute on function public.update_org_member_role(uuid,text) to authenticated;
grant execute on function public.update_organization(uuid,text,text,text,text,numeric,text,text) to authenticated;
grant execute on function public.claim_org_invites() to authenticated;

-- Seat limit is readable by members of that organization only.
create or replace function public.org_seat_limit_for_member(org uuid)
returns int language sql stable security definer set search_path = public as $$
  select case when public.is_org_member(org) then public.org_seat_limit(org) else null end;
$$;
revoke execute on function public.org_seat_limit(uuid) from public, anon, authenticated;
revoke execute on function public.org_seat_limit_for_member(uuid) from public, anon;
grant execute on function public.org_seat_limit_for_member(uuid) to authenticated;
revoke execute on function public.is_org_member(uuid) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;
revoke execute on function public.org_role(uuid) from public, anon;
grant execute on function public.org_role(uuid) to authenticated;

-- Trigger/internal helpers are never called directly by clients.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_profile_billing() from public, anon, authenticated;
revoke execute on function public.check_active_org() from public, anon, authenticated;
