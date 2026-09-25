# Ideas log

A place to keep ideas in clean form.

---

## Idea 1 — Upload any ID document, then let AI read it and fill the form

Status: **done and working end to end, backend and frontend.**

### The problem today
Step 4 of 4 asked for "Citizenship or passport (front)" and "(back)". It was
fixed to two document types, and we only saved the file. None of the details
written on the document were saved, and the user typed everything by hand.

### The idea
Let the supplier pick which document they have, upload it, and let AI read
the details off it and fill the form for them.

---

## The plan as agreed

### Step 4 — Pick your document

Individuals only. Company accounts are unchanged.

| They pick | Then we ask | Photos |
|---|---|---|
| Citizenship | — | front and back |
| National ID | "Card or paper document?" → Card | front and back |
| National ID | "Card or paper document?" → Paper | 1 |

Passport is dropped for now. Photos only — JPG, PNG, WEBP. No PDF, because
the AI has to look at a picture.

The user tells us the type. The AI does not guess it. Uploading is required.
Changing the choice throws away the old photos and details, because they
belong to a different document.

### Step 5 — Check your details

1. User clicks Next.
2. Screen says "Extracting details..." (5 to 15 seconds).
3. Claude reads the images and pulls out the fields for that document type.
4. The form appears, already filled in.
5. User checks it, fixes anything wrong, clicks Next.
6. We save it.

**Name mismatch:** if the name on the document is not the name on their
account, we show a warning. They can fix either one or carry on. Nothing is
blocked.

**If the AI cannot read it:** one try only. Show the empty form and let them
type it in by hand. Uploading a clearer photo counts as a new document and
may be read again. Never block them for good.

**What we save:** only the final, confirmed answer. We do not keep a separate
record of what the AI first read. The details live in their own table and do
not touch the account form.

**Submitting for review** is blocked until the details are saved.

### The AI

- Claude, model **Sonnet 5**.
- Cost: about **$0.014 per document** — roughly $14 per 1,000 suppliers.
- Needs a Claude API key, **scoped to a workspace**. An org-wide key is
  refused unless `ANTHROPIC_WORKSPACE_ID` is also set in `.env.local`.

---

## Two rules that run through everything

**Both scripts.** Names and places are saved twice: `_np` for the Nepali as
printed, `_en` for the English as printed. Nothing is translated, only
copied. A blank means it was not on the paper.

**Both calendars.** Dates are saved twice: `_bs` for Bikram Sambat, `_ad` for
the western date. Both samples print both. When only one is printed the AI
works the other out and marks it `converted`, so the review screen can ask
the supplier to check it.

---

## Fields we save

Confirmed against the samples in `samples/` (git-ignored — real documents).

### Citizenship
Certificate number, full name (both scripts), gender, date of birth (both
calendars), birth place (district, municipality, ward — both scripts),
permanent address (same), father's name, mother's name, spouse's name (both
scripts), citizenship type, issuing office, issue date (both calendars).

### National identity card, and the paper document
ID number, surname, given name (both scripts), nationality, gender, date of
birth (both calendars), father's name, mother's name, spouse's name (both
scripts), permanent address, issuing office, issue date (both calendars).

We do not save the machine-readable lines on the back of the card.

We have no sample of the NID paper document yet, so it looks for the same
fields as the card. If a real one turns up, check the list again.

---

## Out of scope for now

Company documents. Registration certificate and PAN or VAT certificate stay
exactly as they are today — plain file upload, nothing read from them.

Passport. Dropped for now, can be added later the same way.

---

## Order of work

**Backend first, tested, then frontend.**

1. ~~Backend: the three real document types, with the right number of files.~~
2. ~~Backend: new table to hold the details read off the document.~~
3. ~~Backend: the reading endpoint — send images to Claude, get fields back.~~
4. ~~Test all of the above.~~ `npm run test:account` (61 checks, free) and
   `npm run test:read` (reads the real samples, about 3 cents a run).
5. ~~Frontend: step 4, pick your document, and the uploads.~~
6. ~~Frontend: step 5 review screen, with an "Extracting details..." screen
   while it waits.~~
