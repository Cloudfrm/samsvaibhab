-- samsvaibhab: real ID document types, and the details read off them by AI.
--
-- Before this, an individual uploaded a fixed "id_front" and "id_back" and we
-- kept nothing but the file. Now the supplier says which document they have,
-- uploads the right number of photos, and we keep the details written on it.

-- ---------------------------------------------------------------------------
-- Which document the supplier says they have. This decides how many photos we
-- ask for, and which fields we try to read.
-- ---------------------------------------------------------------------------

create type public.id_doc_type as enum (
  'citizenship',  -- citizenship certificate, front and back
  'nid_card',     -- national identity card, front and back
  'nid_paper'     -- the paper slip given while the card is not yet printed
);

alter table public.profiles add column id_doc_type public.id_doc_type;

-- When the AI last read this supplier's photos. We read once per set of
-- photos: a second press of the button costs money and gives the same answer.
-- Uploading a clearer photo makes it a new set, so that may be read again.
alter table public.profiles add column id_read_at timestamptz;

-- No accounts exist yet, so the old fixed document types can simply go.
delete from public.verification_documents where doc_type in ('id_front', 'id_back');

-- ---------------------------------------------------------------------------
-- The details read off the document. One row per supplier.
--
-- Two rules run through this table:
--   * Names and places are kept twice, Nepali and English, exactly as printed.
--     Nothing is translated. A blank means it was not printed, not "unknown".
--   * Dates are kept twice, Bikram Sambat as printed and the western date.
--     Both of these documents normally print both. When only one is printed we
--     let the AI work the other one out and say so in *_ad_source, so the
--     review screen can ask the supplier to check it.
-- ---------------------------------------------------------------------------

create type public.date_source as enum ('printed', 'converted');

create table public.identity_details (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  doc_type public.id_doc_type not null,

  -- Certificate number on a citizenship, national ID number on the others.
  document_number text,

  -- Citizenship prints one full name. The national ID splits it in two.
  full_name_en text,
  full_name_np text,
  surname_en text,
  surname_np text,
  given_name_en text,
  given_name_np text,

  gender text,
  nationality text,

  date_of_birth_bs text,
  date_of_birth_ad date,
  date_of_birth_ad_source public.date_source,

  birth_district_en text,
  birth_district_np text,
  birth_municipality_en text,
  birth_municipality_np text,
  birth_ward text,

  permanent_district_en text,
  permanent_district_np text,
  permanent_municipality_en text,
  permanent_municipality_np text,
  permanent_ward text,

  father_name_en text,
  father_name_np text,
  mother_name_en text,
  mother_name_np text,
  spouse_name_en text,
  spouse_name_np text,

  -- Citizenship only: by descent, by birth, or naturalised, as printed.
  citizenship_kind_en text,
  citizenship_kind_np text,

  issuing_office_en text,
  issuing_office_np text,
  issue_date_bs text,
  issue_date_ad date,
  issue_date_ad_source public.date_source,

  -- Set when the supplier has checked the details and saved them. Only a
  -- confirmed row counts; an unconfirmed one cannot exist, because we save
  -- nothing until they press save.
  confirmed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger identity_details_touch
  before update on public.identity_details
  for each row execute function public.touch_updated_at();

alter table public.identity_details enable row level security;

create policy "own identity details read" on public.identity_details
  for select using (auth.uid() = profile_id);
create policy "admin identity details" on public.identity_details
  for all using (public.is_admin()) with check (public.is_admin());
