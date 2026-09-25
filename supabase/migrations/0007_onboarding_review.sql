-- samsvaibhab: the AI decides whether a new supplier account is approved.
--
-- There is no human in the loop for registration. When the supplier presses
-- Send for approval, the AI reads the current onboarding rules, looks at the
-- account and the ID photos, and either approves it or sends it back with a
-- note. Every decision is kept, so we can see what the AI has been doing.

-- ---------------------------------------------------------------------------
-- The rules, in plain English. One row per edit, the newest version wins. The
-- readable copy lives in onboarding-rules.md and `npm run rules:push` puts it
-- in here. The admin dashboard will edit it directly once it is built.
-- ---------------------------------------------------------------------------

create table public.onboarding_rules (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique,
  content text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

alter table public.onboarding_rules enable row level security;

-- Nobody but an admin reads or writes these. The check itself runs on the
-- server with the secret key, which is not bound by these policies.
create policy "admin onboarding rules" on public.onboarding_rules
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Every decision, by the AI or by an admin. Also how we know a supplier is
-- stuck: three send-backs in a row and the admin is told.
-- ---------------------------------------------------------------------------

create table public.account_reviews (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,

  -- 'approved' or 'sent_back' from the AI; 'admin_approved',
  -- 'admin_rejected' or 'admin_suspended' when a person did it.
  decision text not null,

  -- The note the supplier is shown, in plain words.
  summary text not null,

  -- One short line per thing to fix, so we can count and group them later.
  issues jsonb not null default '[]'::jsonb,

  rules_version integer,
  model text,
  decided_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index account_reviews_profile_idx
  on public.account_reviews (profile_id, created_at desc);

alter table public.account_reviews enable row level security;

create policy "own reviews read" on public.account_reviews
  for select using (auth.uid() = profile_id);
create policy "admin reviews" on public.account_reviews
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- The last answer, kept on the profile so the account screen can show it
-- without going looking for it.
-- ---------------------------------------------------------------------------

alter table public.profiles add column review_summary text;
alter table public.profiles add column reviewed_at timestamptz;

-- How many times in a row the AI has sent this account back. Back to zero on
-- approval. At three, the admin is told the supplier is stuck.
alter table public.profiles add column send_back_count integer not null default 0;

-- ---------------------------------------------------------------------------
-- The one admin. A company now uploads nothing at sign-up, so any old company
-- certificate rows simply stop being asked for and are ignored.
-- ---------------------------------------------------------------------------

update public.profiles set role = 'admin' where email = 'tech@cloudfrm.ai';

-- Version 1 of the rules, the same words as onboarding-rules.md.
insert into public.onboarding_rules (version, content) values (1, $rules$
# Onboarding rules

These rules decide whether a new supplier account is approved.

The AI reads them every single time a supplier presses **Send for approval**.
Change the words here, push them, and the AI follows the new words straight
away. No code change.

There is no human in the loop. The AI either approves the account or sends it
back to the supplier with a note saying what to fix.

---

## What you are deciding

You get one supplier's whole account: their typed details, their bank account,
and the photos of their ID document with the details already read off it.

You give one of two answers:

- **approve** — everything below is satisfied.
- **send back** — something is wrong or missing. Say what, in plain words the
  supplier can act on.

When you are not sure, send it back. An account sent back can be fixed in
minutes. A wrong approval lets an unchecked person trade.

---

## Approve only when all of these are true

1. **Who they are is filled in.**
   - A person: full name, phone number, district.
   - A company: company name, PAN or VAT number, phone number, district.
   - The country is Nepal.

2. **The bank account is filled in** — bank name, account holder name, and
   account number. The account number is digits only, between 6 and 20 of them.

3. **Every photo we asked for is there**, and each one can be read. Judge the
   picture with your own eyes, not by how complete the typed details look:
   - the picture really is the document it is named as
   - all four corners of the document are in the picture
   - the writing is sharp enough to read
   - nothing important is hidden by a finger, a glare, a stamp or a fold
   - it is a photo of the document itself, not a photo of a screen
   - a blank picture, a plain colour, or anything that is not a document at
     all is always sent back

4. **The document looks genuine.** Send it back if the layout is wrong for that
   document, if text looks pasted on, if fonts or spacing change part way
   through, or if the photo has been edited.

5. **The details on the form match the photos.** The name, document number and
   date of birth that were read off the document are the same as what is in the
   photos. Small differences in spacing or punctuation are fine.

6. **The name on the document matches the account name.** See name matching
   below.

7. **The bank account holder name matches the name on the document.** Same
   name matching rules. A supplier is paid into their own account.

8. **They are 18 or older today**, going by the date of birth on the document.

9. **The document number is not already used by another account.** You are told
   whether it is. If it is, send it back.

For a company, rules 3 to 9 do not apply yet — a company uploads no documents
at this stage. Check rules 1 and 2 only.

---

## Name matching

These count as the **same** name:

- the same words in a different order — Thapa Ram Bahadur, Ram Bahadur Thapa
- a short form — Ram B. Thapa, Ram Bahadur Thapa
- the same sound spelled differently — Shrestha and Shresth, Kumar and Kumaar,
  Bikram and Vikram
- one written in Nepali and the other in English
- a missing or extra middle name, when the first and last names match

These count as a **different** name:

- only the surname is the same
- a completely different given name
- a different person's name, even a family member's

---

## Send it back when

- anything in the list above is not satisfied
- a photo cannot be read
- the document belongs to somebody other than the account holder
- the same document number is already on another account
- anything about the account looks made up

---

## Never

- Never approve because the supplier seems honest, or to be helpful.
- Never ask for anything that is not in these rules.
- Never invent a value that is not on the document or in the form.
- Never treat a blank as if it were filled in.

---

## How to write the note when you send it back

The supplier reads this note in an email. So:

- Write to them, not about them. "Your citizenship photo is blurred", not
  "the applicant's document is illegible".
- Simple words. No jargon. No technical terms. No rule numbers.
- One short line for each thing to fix, and say exactly what to do.
- Never mention these rules, the AI, scores, or how the check works.
- Keep the whole note under six lines.

Good example:

> Two things to fix before we can approve your account:
> - The back of your citizenship is blurred. Please take it again in good light.
> - The name on your bank account is Ram Thapa, but your citizenship says
>   Sita Thapa. The bank account must be in your own name.
$rules$);
