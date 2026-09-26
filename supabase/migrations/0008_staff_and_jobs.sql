-- samsvaibhab: the people who work in the control room, and what each of them
-- is allowed to do.
--
-- Until now one person had one `role`: supplier, buyer or admin. That mixed
-- two different things - what kind of customer you are, and what your job here
-- is. A risk analyst is not a customer type. And `admin` meant "can do
-- everything", so there was no way to say "Sita sees risk but not bank
-- accounts".
--
-- Staff are now their own thing. A staff member holds one or more jobs, and a
-- job carries a list of what it is allowed to do. A new job is a row, not a
-- code change.

-- ---------------------------------------------------------------------------
-- The jobs, and what each one may do.
-- ---------------------------------------------------------------------------

create table public.jobs (
  key text primary key,
  label text not null,
  description text,

  -- What this job may do. "*" means everything, and is only for the owner.
  permissions text[] not null default '{}',

  created_at timestamptz not null default now()
);

insert into public.jobs (key, label, description, permissions) values
  ('owner', 'Owner',
   'Everything, including adding and removing staff.',
   array['*']),

  ('approvals', 'Approvals',
   'Supplier accounts. Sees the ID photos, because judging them is the job.',
   array[
     'suppliers.read',
     'suppliers.decide',
     'documents.view',
     'rules.read'
   ]),

  ('risk', 'Risk',
   'Looks at accounts and the decision history. No full bank numbers.',
   array[
     'suppliers.read',
     'activity.read',
     'rules.read'
   ]);

-- ---------------------------------------------------------------------------
-- The staff themselves.
--
-- Keyed by email, because the owner adds somebody before that person has ever
-- logged in. `user_id` is filled in the first time they do.
-- ---------------------------------------------------------------------------

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text,
  user_id uuid unique references auth.users(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  added_by uuid references public.staff(id)
);

create table public.staff_jobs (
  staff_id uuid not null references public.staff(id) on delete cascade,
  job_key text not null references public.jobs(key) on delete restrict,
  primary key (staff_id, job_key)
);

-- ---------------------------------------------------------------------------
-- Who looked at what, and who changed what.
--
-- Not the same as account_reviews, which is the decisions themselves. This is
-- every look at a document or a bank number, and every change to staff or
-- rules. If it is not written down from day one, the history is gone for good.
-- ---------------------------------------------------------------------------

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references public.staff(id) on delete set null,

  -- 'supplier.viewed', 'document.opened', 'bank.viewed', 'supplier.decided',
  -- 'staff.added', 'staff.changed', 'rules.updated'
  action text not null,

  -- What it was done to. A profile id, a staff id, and so on.
  subject_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_log_recent_idx on public.activity_log (created_at desc);
create index activity_log_subject_idx on public.activity_log (subject_id, created_at desc);

-- ---------------------------------------------------------------------------
-- "Is this person staff?" now means the staff table, not a role on a profile.
--
-- Every policy written before this already calls is_admin(), so redefining it
-- here keeps all of them working. It is owned by postgres and bypasses row
-- level security, so a policy on the staff table can safely call it.
--
-- This is the coarse wall: staff in, customers out. Which staff member may do
-- which particular thing is decided by the job permissions, in the app.
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff
    where user_id = auth.uid() and is_active
  );
$$;

alter table public.jobs enable row level security;
alter table public.staff enable row level security;
alter table public.staff_jobs enable row level security;
alter table public.activity_log enable row level security;

create policy "staff read jobs" on public.jobs
  for select using (public.is_admin());
create policy "staff read staff" on public.staff
  for select using (public.is_admin());
create policy "staff read staff jobs" on public.staff_jobs
  for select using (public.is_admin());
create policy "staff read activity" on public.activity_log
  for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- The first owner. Without this nobody can get in and add anybody else.
-- ---------------------------------------------------------------------------

insert into public.staff (email, full_name, user_id)
select 'tech@cloudfrm.ai', 'Owner', p.id
from public.profiles p
where p.email = 'tech@cloudfrm.ai'
union all
select 'tech@cloudfrm.ai', 'Owner', null
where not exists (select 1 from public.profiles where email = 'tech@cloudfrm.ai')
limit 1;

insert into public.staff_jobs (staff_id, job_key)
select id, 'owner' from public.staff where email = 'tech@cloudfrm.ai';

-- A decision made by a person is now made by a staff member, not by a profile.
alter table public.account_reviews
  drop constraint account_reviews_decided_by_fkey;
alter table public.account_reviews
  add constraint account_reviews_decided_by_fkey
  foreign key (decided_by) references public.staff(id) on delete set null;
