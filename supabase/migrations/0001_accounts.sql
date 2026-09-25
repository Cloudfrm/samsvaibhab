-- samsvaibhab: accounts, verification, payment accounts, editable pages

create type public.user_role as enum ('supplier', 'buyer', 'admin');
create type public.account_type as enum ('individual', 'company');
create type public.review_status as enum ('pending', 'approved', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role,
  account_type public.account_type,
  status public.review_status not null default 'pending',
  email text,
  full_name text,
  company_name text,
  registration_number text,
  phone text,
  country text,
  district text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payment_accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  method text not null,
  account_name text,
  account_number text,
  bank_name text,
  branch text,
  is_primary boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.verification_documents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  doc_type text not null,
  file_path text not null,
  status public.review_status not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id)
);

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  audience text,
  content text not null,
  version integer not null default 1,
  is_published boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create table public.page_versions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  version integer not null,
  title text not null,
  content text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  unique (page_id, version)
);

create table public.page_acceptances (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  page_id uuid not null references public.pages(id) on delete cascade,
  version integer not null,
  ip text,
  accepted_at timestamptz not null default now()
);

-- Owned by postgres, so it bypasses RLS and avoids recursive policy checks.
create function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- A logged-in user must never change their own role or approval status.
create function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.role := old.role;
    new.status := old.status;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger protect_profile_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- Every new auth user gets a profile row automatically.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, full_name)
  values (
    new.id,
    new.email,
    case
      when new.raw_user_meta_data ->> 'role' in ('supplier', 'buyer')
        then (new.raw_user_meta_data ->> 'role')::public.user_role
      else null
    end,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep a version snapshot every time a page changes.
create function public.snapshot_page_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.page_versions (page_id, version, title, content, created_by)
  values (new.id, new.version, new.title, new.content, new.updated_by)
  on conflict (page_id, version) do nothing;
  return new;
end;
$$;

create trigger snapshot_page_version
  after insert or update on public.pages
  for each row execute function public.snapshot_page_version();

alter table public.profiles enable row level security;
alter table public.payment_accounts enable row level security;
alter table public.verification_documents enable row level security;
alter table public.pages enable row level security;
alter table public.page_versions enable row level security;
alter table public.page_acceptances enable row level security;

create policy "own profile read" on public.profiles
  for select using (auth.uid() = id);
create policy "own profile update" on public.profiles
  for update using (auth.uid() = id);
create policy "admin profile read" on public.profiles
  for select using (public.is_admin());
create policy "admin profile update" on public.profiles
  for update using (public.is_admin());

create policy "own payment accounts" on public.payment_accounts
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy "admin payment accounts read" on public.payment_accounts
  for select using (public.is_admin());

create policy "own documents read" on public.verification_documents
  for select using (auth.uid() = profile_id);
create policy "own documents insert" on public.verification_documents
  for insert with check (auth.uid() = profile_id);
create policy "admin documents" on public.verification_documents
  for all using (public.is_admin()) with check (public.is_admin());

create policy "anyone reads published pages" on public.pages
  for select using (is_published);
create policy "admin writes pages" on public.pages
  for all using (public.is_admin()) with check (public.is_admin());

create policy "anyone reads page versions" on public.page_versions
  for select using (true);

create policy "own acceptance insert" on public.page_acceptances
  for insert with check (auth.uid() = profile_id);
create policy "own acceptance read" on public.page_acceptances
  for select using (auth.uid() = profile_id);
create policy "admin acceptance read" on public.page_acceptances
  for select using (public.is_admin());

insert into public.pages (slug, title, audience, content) values
  ('terms-supplier', 'Supplier Terms and Conditions', 'supplier',
   E'## 1. Lorem ipsum\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\n\n## 2. Ut enim\n\n- Ut enim ad minim veniam, quis nostrud exercitation.\n- Duis aute irure dolor in reprehenderit in voluptate.\n\n## 3. Excepteur\n\nExcepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.'),
  ('terms-buyer', 'Buyer Terms and Conditions', 'buyer',
   E'## 1. Lorem ipsum\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\n\n## 2. Ut enim\n\n- Ut enim ad minim veniam, quis nostrud exercitation.\n- Duis aute irure dolor in reprehenderit in voluptate.\n\n## 3. Excepteur\n\nExcepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.'),
  ('privacy-policy', 'Privacy Policy', 'all',
   E'## 1. Lorem ipsum\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit.\n\n## 2. Sed ut perspiciatis\n\nSed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium.');
