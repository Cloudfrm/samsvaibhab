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

---

## Idea 2 — Drop company documents, then build the AI admin dashboard

Status: **built and tested, backend only. The emails are not wired up yet —
waiting on the Resend key.**

### Part 1 — Company accounts upload nothing at first

The "upload your documents" part for an individual — a farmer or a person —
is good. But when they go the company route, we can ask them for the company
registration certificate and the PAN or VAT certificate later. So they don't
have to upload any documents. I want that removed at first.

### Part 2 — The admin dashboard

Right now we've only built the supplier side. We've not built the buyer part
yet.

For the supplier part: when they hit **Send for approval**, I want the
approval to come to an admin dashboard.

- We're going to have to create an admin dashboard, and that's going to be a
  completely different route.
- We're going to have to protect the admin route. That's the most important
  thing.
- The admin dashboard is going to be completely AI powered. We're going to
  set some rules — a lot of discussion on this — on what sorts of accounts
  the AI should approve and what sorts it should not.

The auto-approval from the AI part, we'll work on that later. The AI is
never actually going to approve it by itself.

### What we work on now

AI fetches everything that comes in. We give it a set of rules, and the AI
sets the status of a contact, or user detail, or any detail that comes in
from the supplier side.

- If it's ready, it marks it **ready to approve**.
- If it's missing something, it sets the status **missing some documents**,
  and puts a summary on what exactly is missing.

If something is missing, it shouldn't even come to the human. Human in the
loop is always when it's ready for approval — the human approves it at last.

If there's a decline for any reason, it sends an email to the registered
user. The email says this is not available, so you need to come back and put
this there, or upload this there, or whatever is not there. Just a
description. They come back, fix it, and resubmit.

Admin is going to do all the approvals.

When something is ready to approve, the AI sends the admin an email to say
the approval is ready. It will not auto approve. Auto approval comes later.

### Where this sits

Our admin is going to be complete AI. This is the first step towards it —
registering a supplier.

Once that's approved, then we're going to have to create the supplier form
fill-up and all that. But we'll do that later. For now, we build this.

The admin dashboard is going to be an AI chatbot dashboard that automates
everything. But we don't work on the frontend yet. We build the backend
first.

---

## Idea 2 — decisions made

| Question | Decision |
|---|---|
| Company documents | Drop both file uploads. Companies still **type** their PAN or VAT number and company name. Certificates are asked for later, after approval. |
| If the AI finds something missing | Account goes back to **incomplete**. Supplier gets the email, fixes it, sends for approval again. The admin never sees it. |
| Email service | **Resend.** Needs an API key and a from-address. |
| The rules | I write a first list in plain English. You edit the words. |
| Where the rules live | **In the database**, with a version number, like the terms pages already are. You edit them from the admin dashboard once the frontend is built. The AI reads the current version on every check, so an edit takes effect straight away — no code change, no deploy. |
| Who is admin | `tech@cloudfrm.ai`. |
| When the AI runs | **Right away** when the supplier hits Send for approval. |
| What the AI looks at | The typed details **and the ID photos again**, so it can also say a photo is blurry or upside down. About 1.5 cents per check. |
| Human in the loop | **None, for registration.** If everything is good, the **AI approves** the account itself. |
| Admin account | `tech@cloudfrm.ai` is flipped to role **admin**. Its leftover supplier data stays but is ignored. Supplier testing moves to another email. |
| Resend setup | Already set up. You give me the **API key** and the **from-address**. |
| Grey cases | Only **two** answers. A name that does not match, or a photo that looks edited, is **sent back to the supplier** with a plain description of what to fix. Nothing lands on a human. |
| Admin email | **One summary a day** of what the AI did — approved these, sent these back, and why. The admin watches, does not act. The supplier's "something is missing" email still goes out straight away. |
| Stuck supplier | If the AI sends the same account back **3 times**, it still does not approve, but the admin gets an email with the history so a stuck person can be helped. |
| Undo an approval | The admin can **suspend** an approved account, with a reason and an email. The safety net if the AI gets one wrong. |
| Model | **Sonnet 5**, the same one that already reads the ID documents. |
| Approving while backend-only | Approve, reject and suspend **endpoints plus a test script**. The chatbot dashboard plugs into these same endpoints later. |
| Daily email time | **6:00 pm Nepal time.** |
| Supplier approved email | **Yes** — a short welcome email when the AI approves them. |
| Chatbot dashboard | **Not in this build.** No frontend at all, and no chat endpoint. We think about it later. |
| Company uploads | Removed from the backend rules **and** the two upload boxes come off the screen. |
| Order | **One branch**, everything together. |

---

## Idea 2 — what gets built

**One branch. Backend, plus the one small screen edit for the company boxes.**

### 1. Company accounts stop uploading documents
The two upload boxes go. Companies still type their company name and PAN or
VAT number. We ask for the certificates after approval, later.

### 2. A rules document, kept in the database
Plain English, with a version number. I write the first one, you edit the
words. The AI reads the current version on every check.

### 3. The AI check, when the supplier hits Send for approval
Sonnet 5 looks at the typed details and the ID photos, against your rules,
and gives one of two answers:

- **Good** → the AI **approves** the account. Supplier gets a welcome email.
- **Not good** → the account goes back to **incomplete**, and the supplier
  gets an email saying exactly what to fix. No human anywhere.

Missing name, unreadable photo, name on the document not matching the
account — all of it goes back to the supplier in plain words.

### 4. The stuck supplier
Sent back 3 times and still not right — the AI still does not approve, but
the admin gets an email with the history so the person can be helped.

### 5. Emails (Resend)
| To | When |
|---|---|
| Supplier | Approved — short welcome. |
| Supplier | Sent back — what to fix. |
| Admin | 6:00 pm daily — what the AI approved and sent back, and why. |
| Admin | A supplier is stuck after 3 tries. |

### 6. Admin, backend only
`tech@cloudfrm.ai` becomes the admin. The admin route is protected. Plain
endpoints to list accounts, approve, reject, and **suspend** an already
approved account. A test script proves the whole flow.

### What I need from you
1. **Resend API key** and the **from-address**. Put them in `.env.local`,
   never in chat.
2. Another email to test the supplier side with, since `tech@cloudfrm.ai`
   becomes the admin.
3. Your edits to the first rules document, once I write it.

### Not in this build
The chatbot dashboard. Any admin screens. The buyer side. The supplier form
fill-up that comes after approval.

### Built on 25 September 2026

- Company uploads gone, backend and screen.
- `onboarding-rules.md` — the rules, in plain English. Edit the file and run
  `npm run rules:push` to make the AI follow the new words. Version 1 is also
  seeded into the database, so a fresh deploy always has rules.
- Send for approval now runs the check there and then, about 6 seconds, and
  either approves the account or sends it back with a note.
- Every decision is written down, with which version of the rules it used.
- Admin endpoints: list, see one in full with the decision history, approve,
  reject with a reason, suspend with a reason. `tech@cloudfrm.ai` is admin.
- `npm run test:account` — 69 checks, free.
  `npm run test:review` — the real AI check, about 10 cents a run.

Still to do: the four emails, once the Resend key is in. The spots are marked
`TODO email` in the code.

---

## Idea 3 — Staff jobs and permissions, then the supplier list

Status: **agreed, not built. Waiting for the go.**

No product catalogue yet, and no buyer onboarding yet, so we build only what
already exists: suppliers.

### Why permissions come first

Permissions are hard to change later, because every endpoint checks them.
A transport table added in six months touches nothing. A change to who is
allowed to see what touches every file. So the walls go up before the rooms.

Today one person has one `role`: supplier, buyer or admin. That mixes two
different things — **what kind of customer you are** and **what your job here
is**. A risk analyst is not a customer type. And `admin` means "can do
everything", so there is no way to say "Sita sees risk but not bank accounts".

### The jobs, to start with

| Job | What it is for |
|---|---|
| **Owner** | You. Everything. The only one who can add or remove staff. There is always at least one. |
| **Approvals** | Supplier accounts. Sees the ID photos, because judging them is the job. |
| **Risk** | Looks at accounts and decision history. Does not see full bank numbers — last 4 digits only. |

More jobs — accounts, transport, insurance — are added to the list later with
no code change.

### Sensitive details

Only the jobs that need them:

- the **ID photos**: Approvals and Owner
- the **full bank account number**: Owner only for now, and Accounts when that
  job is added. Everyone else sees the last 4 digits.
- **every look at a document or a bank number is written down.**

### Adding staff

You add them by email and pick their jobs. They log in with that email and
land in the control room.

### The supplier screen

Two screens, plain, no design pass.

1. **The list** — name, phone number, email. Nothing more.
2. **Click one, see everything** — all their details, bank, documents, and
   every decision the AI made on them, with the reason.

**Look only. No buttons yet.** Approve, reject and suspend already work in the
backend. The buttons go on the screen later, once you have seen the data and
know what you want.

### Order of work

1. Backend: staff, jobs, one permission check used everywhere, activity log.
2. Test it fully.
3. Frontend: the list screen and the detail screen, behind those permissions.

### Not in this step

The product catalogue. Buyer onboarding. The chatbot. Transport, risk scoring,
insurance, routes, purchase orders.

---

## Idea 4 — Buyer onboarding

Status: **brainstorm only. Nothing agreed yet.**

### The problem today

A buyer who logs in with an incomplete account gets sent to `/onboarding` —
the same screens built for the supplier. That includes the ID document step,
which a buyer should not see.

### What we know so far

Buyer needs its own onboarding, separate from the supplier one.

**ID document — not decided yet.** Do buyers need to prove who they are at
all, like suppliers do? If yes, with what document? This needs an answer
before we can plan the steps.

**Fields for the buyer form**, from the sample screen you shared. Not
deciding the order or number of steps yet, just the fields:

| Field | Required? |
|---|---|
| Contact person name | Yes |
| Company / business name | Yes |
| Contact number (mobile/WhatsApp) | Yes |
| Delivery location | No |
| State | No |
| City | No |
| Pin code | Yes |
| Any special requirement | No |

Preferred delivery mode — left out, not needed for now.

### Decided: no buyer approval

A buyer does not need approval, and does not need to prove who they are at
onboarding. Checking who they are happens later, when a purchase order is
made — not now.

So buyer onboarding is just: fill the form above, submit, done. No pending
screen, no admin review, no ID document.

### Decided: after onboarding, a blank page for now

Once the buyer submits the form, they need somewhere to land. We have not
built the buyer dashboard yet, so for now it is a blank placeholder page.
The real buyer dashboard is a separate, later piece of work.

### Open questions, before we can finalize a plan

1. Company accounts only, or can an individual sign up as a buyer too?
2. Since there is no approval step, what does the buyer's account status say
   right after they submit — is it just "active" straight away?

### Not in this idea yet

The onboarding step order. The real buyer dashboard (blank page stands in
for it). Building anything.
