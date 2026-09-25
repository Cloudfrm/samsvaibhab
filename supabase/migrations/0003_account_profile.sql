-- samsvaibhab: account details form, supplier bank account, verification documents

-- ---------------------------------------------------------------------------
-- Reference lists. The form only accepts values that exist in these tables.
-- ---------------------------------------------------------------------------

create table public.countries (
  code text primary key,
  name text not null
);

create table public.districts (
  name text primary key,
  province text not null
);

alter table public.countries enable row level security;
alter table public.districts enable row level security;

create policy "anyone reads countries" on public.countries for select using (true);
create policy "anyone reads districts" on public.districts for select using (true);

-- ---------------------------------------------------------------------------
-- Profile: the fields the account form fills in.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column city text,
  add column pan_vat text,
  add column id_number text,
  add column submitted_at timestamptz;

alter table public.profiles
  alter column status set default 'incomplete';

-- Nobody has submitted the form yet, so nothing is really waiting for review.
update public.profiles set status = 'incomplete' where status = 'pending';

alter table public.profiles
  add constraint profiles_country_fk foreign key (country) references public.countries(code),
  add constraint profiles_district_fk foreign key (district) references public.districts(name);

-- ---------------------------------------------------------------------------
-- Bank account. One primary account per profile; suppliers only for now.
-- ---------------------------------------------------------------------------

create unique index payment_accounts_primary_idx
  on public.payment_accounts (profile_id)
  where is_primary;

-- ---------------------------------------------------------------------------
-- Verification documents. One file per document type, re-uploading replaces it.
-- ---------------------------------------------------------------------------

alter table public.verification_documents
  add column file_name text,
  add column mime_type text,
  add column size_bytes integer;

create unique index verification_documents_type_idx
  on public.verification_documents (profile_id, doc_type);

-- ---------------------------------------------------------------------------
-- Private storage bucket for those documents. Not public: files are only
-- reachable through short-lived signed links made by the server.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'verification-docs',
  'verification-docs',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Extra lock on the bucket: a user only ever touches their own folder. The
-- server uses the service key and is not affected by these. Some hosted
-- Postgres roles may not own storage.objects, so a refusal here is not fatal.
do $$
begin
  create policy "own docs read" on storage.objects for select
    using (bucket_id = 'verification-docs'
           and (storage.foldername(name))[1] = auth.uid()::text);

  create policy "own docs write" on storage.objects for insert
    with check (bucket_id = 'verification-docs'
                and (storage.foldername(name))[1] = auth.uid()::text);

  create policy "own docs delete" on storage.objects for delete
    using (bucket_id = 'verification-docs'
           and (storage.foldername(name))[1] = auth.uid()::text);

  create policy "admin docs read" on storage.objects for select
    using (bucket_id = 'verification-docs' and public.is_admin());
exception
  when insufficient_privilege then
    raise notice 'skipped storage.objects policies: not the owner of the table';
  when duplicate_object then
    raise notice 'storage.objects policies already exist';
end;
$$;
