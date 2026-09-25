# Ideas log

A place to keep ideas in clean form.

---

## Idea 1 — Upload any ID document, then let AI read it and fill the form

Status: **plan agreed. Waiting on sample documents, then waiting on "go".**

### The problem today
Step 4 of 4 asks for "Citizenship or passport (front)" and "(back)". It is
fixed to two document types, and we only save the file. None of the details
written on the document are saved, and the user types everything by hand.

### The idea
Let the supplier pick which document they have, upload it, and let AI read
the details off it and fill the form for them.

---

## The plan

### Step 4 — Pick your document

A dropdown. Three choices:

| Document | Files needed |
|---|---|
| Citizenship | Front and back (2) |
| National identity card | Front and back (2) |
| Passport | 1 |

The user tells us the type. The AI does not guess it.

Uploading a document is **required**. A supplier cannot finish onboarding
without it.

### Step 5 — Check your details (new step)

1. User clicks Next.
2. Screen says "Reading your document..." (5 to 15 seconds).
3. Claude reads the images and pulls out the fields for that document type.
4. The form appears, already filled in.
5. User checks it, fixes anything wrong, clicks Next.
6. We save it.

**Name mismatch:** if the name on the document is not the name on their
account, we show a warning. They can fix either one or carry on. Nothing is
blocked.

**If the AI cannot read it:** ask for a clearer photo. If the second try
also fails, show the empty form and let them type it in by hand. Never
block them for good.

**What we save:** only the final, confirmed answer. We do not keep a
separate record of what the AI first read.

### The AI

- Claude, model **Sonnet 5**.
- Cost: about **$0.014 per document** — roughly $14 per 1,000 suppliers.
- Needs a Claude API key. A Claude.ai subscription does **not** cover this.

---

## Fields to save

Draft list. To be confirmed against the sample documents.

### Citizenship
- Citizenship certificate number
- Issue district
- Issue date
- Citizenship type (by descent / by birth / naturalised)
- Full name
- Gender
- Date of birth
- Birthplace
- Permanent address (district, municipality or VDC, ward)
- Father's name
- Mother's name
- Spouse's name

### Passport
- Passport number
- Surname
- Given name
- Nationality
- Date of birth
- Sex
- Place of birth
- Date of issue
- Date of expiry
- Issuing authority
- National ID number (if printed)

### National identity card
- National ID number
- Full name
- Date of birth
- Gender
- Father's name
- Mother's name
- Spouse's name
- Permanent address (district, municipality, ward)
- Issue date

---

## Out of scope for now

Company documents. Registration certificate and PAN or VAT certificate stay
exactly as they are today — plain file upload, nothing read from them. We
do that later.

---

## Order of work

**Backend first, tested, then frontend.**

1. Backend: change document types from `id_front` / `id_back` to the three
   real types, with the right number of files each.
2. Backend: new table to hold the details read off the document.
3. Backend: the reading endpoint — send images to Claude, get fields back.
4. Test all of the above.
5. Frontend: step 4 dropdown and uploads.
6. Frontend: step 5 review screen.

---

## What we need from the user

1. **Sample images** — one citizenship (front and back), one passport, one
   national identity card. Blank or fake is fine. These decide the final
   field list.
2. **A Claude API key** — from platform.claude.com. Goes in `.env.local`,
   never in git, never pasted in chat.
3. **Confirm the field lists above** once the samples are in.
