"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Profile } from "@/lib/auth";
import { DATE_PAIRS, FIELDS, FIELD_LABELS, SECTIONS } from "@/lib/identity";

type Country = { code: string; name: string };
type District = { name: string; province: string };
type Bank = {
  bank_name: string | null;
  branch: string | null;
  account_name: string | null;
  account_number: string | null;
};
type Doc = {
  id: string;
  doc_type: string;
  file_name: string | null;
  mime_type: string | null;
  url: string | null;
};

type Props = {
  profile: Profile;
  bank: Bank | null;
  documents: Doc[];
  countries: Country[];
  districts: District[];
  requiredDocs: Record<string, string[]>;
  docLabels: Record<string, string>;
  idDocLabels: Record<string, string>;
};

type Errors = Record<string, string>;

export function AccountForm({
  profile: initialProfile,
  bank: initialBank,
  documents: initialDocs,
  countries,
  districts,
  requiredDocs,
  docLabels,
  idDocLabels,
}: Props) {
  const router = useRouter();

  const [profile, setProfile] = useState(initialProfile);
  const [docs, setDocs] = useState(initialDocs);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  // Step 4 asks for a family first, because "national identity" comes in two
  // shapes and we have to know which before we know how many photos to ask for.
  const [idFamily, setIdFamily] = useState(
    initialProfile.id_doc_type === "citizenship"
      ? "citizenship"
      : initialProfile.id_doc_type
        ? "nid"
        : "",
  );

  // Step 5: what the AI read, or what the supplier has typed over it.
  const [identity, setIdentity] = useState<Record<string, string> | null>(null);
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState("");
  const tried = useRef(false);

  const [form, setForm] = useState({
    account_type: initialProfile.account_type ?? "",
    id_doc_type: initialProfile.id_doc_type ?? "",
    full_name: initialProfile.full_name ?? "",
    company_name: initialProfile.company_name ?? "",
    pan_vat: initialProfile.pan_vat ?? "",
    registration_number: initialProfile.registration_number ?? "",
    phone: initialProfile.phone ?? "",
    country: initialProfile.country ?? (initialProfile.role === "supplier" ? "NP" : ""),
    district: initialProfile.district ?? "",
    city: initialProfile.city ?? "",
    bank_name: initialBank?.bank_name ?? "",
    branch: initialBank?.branch ?? "",
    account_name: initialBank?.account_name ?? "",
    account_number: initialBank?.account_number ?? "",
  });

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const isSupplier = profile.role === "supplier";
  const isCompany = form.account_type === "company";

  const steps = useMemo(() => {
    const list = ["who", "where"];
    if (isSupplier) list.push("bank");
    // A person picks an ID document and then checks what we read off it. A
    // company just uploads its papers; nothing is read from those.
    const docSteps = isCompany
      ? ["documents"]
      : ["document", "documents", "identity"];
    return [...(profile.role ? [] : ["role"]), ...list, ...docSteps, "review"];
  }, [isCompany, isSupplier, profile.role]);

  const current = steps[step];
  // Company files are fixed. An individual's files depend on which ID
  // document they picked in step 4, so there is nothing to ask for until then.
  const needed =
    form.account_type === "company"
      ? requiredDocs.company
      : form.id_doc_type
        ? requiredDocs[form.id_doc_type]
        : [];

  // --- step 5: read the photos, once, when the screen opens -----------------

  const docType = form.id_doc_type;

  useEffect(() => {
    if (current !== "identity" || !docType || tried.current) return;
    tried.current = true;

    let stop = false;

    const blank = () => {
      const empty: Record<string, string> = {};
      for (const field of FIELDS[docType as keyof typeof FIELDS]) empty[field] = "";
      for (const pair of DATE_PAIRS) empty[pair.source] = "";
      return empty;
    };

    const fill = (from: Record<string, unknown>) => {
      const filled = blank();
      for (const key of Object.keys(filled)) {
        const value = from[key];
        filled[key] = typeof value === "string" ? value : "";
      }
      return filled;
    };

    (async () => {
      setReading(true);

      // Already checked and saved once? Show that, do not read again.
      const saved = await fetch("/api/profile/identity")
        .then((r) => r.json())
        .catch(() => null);

      if (stop) return;

      if (saved?.identity) {
        setIdentity(fill(saved.identity));
        setReading(false);
        return;
      }

      const res = await fetch("/api/profile/identity", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (stop) return;

      if (res.ok) {
        setIdentity(fill(body.fields));
      } else {
        // One try only. An empty form is better than a dead end.
        setIdentity(blank());
        setReadNote(
          body.error ?? "We could not read your document. Please type it in below.",
        );
      }

      setReading(false);
    })();

    return () => {
      stop = true;
    };
  }, [current, docType]);

  // The name as the document spells it. Citizenship prints one name, the
  // national identity card prints a given name and a surname.
  const nameOnDocument = !identity
    ? ""
    : (
        identity.full_name_en ||
        [identity.given_name_en, identity.surname_en].filter(Boolean).join(" ")
      ).trim();

  const tidy = (name: string) => name.toLowerCase().replace(/\s+/g, " ").trim();
  const nameMismatch =
    Boolean(nameOnDocument) &&
    Boolean(profile.full_name) &&
    tidy(nameOnDocument) !== tidy(profile.full_name ?? "");

  // --- talking to the backend -----------------------------------------------

  const send = async (url: string, method: string, body: unknown) => {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, body: await res.json() };
  };

  const fail = (body: { errors?: Errors; missing?: string[]; error?: string }) => {
    const found: Errors = { ...(body.errors ?? {}) };
    body.missing?.forEach((field) => (found[field] = "This is needed"));
    if (Object.keys(found).length === 0) found._ = body.error ?? "Something went wrong";
    setErrors(found);
  };

  const saveAndGo = async (payload: Record<string, string>) => {
    setBusy(true);
    const { ok, body } = await send("/api/profile", "PATCH", payload);
    setBusy(false);
    if (!ok) return fail(body);
    setProfile(body.profile);
    setErrors({});
    setStep((s) => s + 1);
  };

  const next = async () => {
    if (current === "role") {
      setBusy(true);
      const { ok, body } = await send("/api/profile/role", "POST", {
        role: form.account_type === "supplier" ? "supplier" : "buyer",
      });
      setBusy(false);
      if (!ok) return fail(body);
      setProfile(body.profile);
      setForm((f) => ({
        ...f,
        account_type: "",
        country: body.profile.role === "supplier" ? "NP" : "",
      }));
      setErrors({});
      return setStep((s) => s + 1);
    }

    if (current === "who") {
      if (!form.account_type) return setErrors({ account_type: "Pick one" });
      return saveAndGo(
        isCompany
          ? {
              account_type: form.account_type,
              company_name: form.company_name,
              pan_vat: form.pan_vat,
              registration_number: form.registration_number,
              phone: form.phone,
            }
          : {
              account_type: form.account_type,
              full_name: form.full_name,
              phone: form.phone,
            },
      );
    }

    if (current === "where") {
      return saveAndGo(
        isSupplier
          ? { country: "NP", district: form.district }
          : { country: form.country, city: form.city },
      );
    }

    if (current === "document") {
      if (!form.id_doc_type) {
        return setErrors({
          id_doc_type:
            idFamily === "nid" ? "Card or paper document?" : "Pick one",
        });
      }
      // A different document means the old photos and details are wrong.
      if (form.id_doc_type !== profile.id_doc_type) {
        setDocs([]);
        setIdentity(null);
        setReadNote("");
        tried.current = false;
      }
      return saveAndGo({ id_doc_type: form.id_doc_type });
    }

    if (current === "documents" && !isCompany) {
      const left = needed.filter((t) => !docs.some((d) => d.doc_type === t));
      if (left.length > 0) {
        return setErrors({ _: "Add every photo before you go on." });
      }
      setErrors({});
      return setStep((s) => s + 1);
    }

    if (current === "identity") {
      setBusy(true);
      const { ok, body } = await send("/api/profile/identity", "PUT", identity ?? {});
      setBusy(false);
      if (!ok) return fail(body);
      setErrors({});
      return setStep((s) => s + 1);
    }

    if (current === "bank") {
      setBusy(true);
      const { ok, body } = await send("/api/profile/bank", "PUT", {
        bank_name: form.bank_name,
        branch: form.branch,
        account_name: form.account_name,
        account_number: form.account_number,
      });
      setBusy(false);
      if (!ok) return fail(body);
      setErrors({});
      return setStep((s) => s + 1);
    }

    setErrors({});
    setStep((s) => s + 1);
  };

  const upload = async (docType: string, file: File) => {
    setBusy(true);
    const data = new FormData();
    data.set("doc_type", docType);
    data.set("file", file);
    const res = await fetch("/api/profile/documents", { method: "POST", body: data });
    const body = await res.json();
    setBusy(false);

    if (!res.ok) return setErrors({ [docType]: body.error });

    setErrors({});
    setDocs((list) => [
      ...list.filter((d) => d.doc_type !== docType),
      body.document,
    ]);
  };

  const finish = async () => {
    if (profile.status === "approved") {
      router.push("/account");
      return router.refresh();
    }

    setBusy(true);
    const res = await fetch("/api/profile/submit", { method: "POST" });
    const body = await res.json();
    setBusy(false);

    if (!res.ok) {
      const all = [
        ...(body.missing?.details ?? []),
        ...(body.missing?.bank ?? []),
        ...(body.missing?.documents ?? []),
        ...(body.missing?.identity ?? []),
      ];
      return setErrors({
        _: `Still missing: ${all.map((f) => LABELS[f] ?? f).join(", ")}`,
      });
    }

    router.push("/account");
    router.refresh();
  };

  // --- the screens ----------------------------------------------------------

  const total = steps.length - 1;

  return (
    <main className="mx-auto w-full max-w-[460px] flex-1 px-6 pb-12">
      <p className="text-[12px] uppercase tracking-[0.12em] text-ink-faint">
        {`Step ${Math.min(step + 1, total)} of ${total}`}
      </p>

      <div className="mt-3 flex gap-1.5">
        {steps.slice(0, total).map((s, i) => (
          <span
            key={s}
            className={`h-[3px] flex-1 rounded-full ${
              i <= step ? "bg-primary" : "bg-hairline-cool"
            }`}
          />
        ))}
      </div>

      {current === "role" && (
        <Screen
          title="Are you selling or buying?"
          sub="This decides what we ask you next."
        >
          <Choice
            checked={form.account_type === "supplier"}
            onSelect={() => set("account_type", "supplier")}
            title="I sell produce"
            body="Farmers, cooperatives and traders in Nepal."
          />
          <Choice
            checked={form.account_type === "buyer"}
            onSelect={() => set("account_type", "buyer")}
            title="I buy produce"
            body="Importers and wholesalers, in Nepal or abroad."
          />
          <Error text={errors.account_type} />
        </Screen>
      )}

      {current === "who" && (
        <Screen title="Who are you?" sub="Tell us how you trade.">
          <Choice
            checked={form.account_type === "individual"}
            onSelect={() => set("account_type", "individual")}
            title="A person"
            body="One farmer or one trader, in your own name."
          />
          <Choice
            checked={isCompany}
            onSelect={() => set("account_type", "company")}
            title="A company"
            body="A registered business, cooperative or firm."
          />
          <Error text={errors.account_type} />

          {form.account_type && (
            <div className="mt-6 space-y-4">
              {isCompany ? (
                <>
                  <Field
                    label="Company name"
                    value={form.company_name}
                    onChange={(v) => set("company_name", v)}
                    error={errors.company_name}
                  />
                  <Field
                    label="PAN or VAT number"
                    value={form.pan_vat}
                    onChange={(v) => set("pan_vat", v)}
                    error={errors.pan_vat}
                  />
                  <Field
                    label="Registration number"
                    hint="Optional"
                    value={form.registration_number}
                    onChange={(v) => set("registration_number", v)}
                    error={errors.registration_number}
                  />
                </>
              ) : (
                <>
                  <Field
                    label="Full name"
                    value={form.full_name}
                    onChange={(v) => set("full_name", v)}
                    error={errors.full_name}
                  />
                </>
              )}
              <Field
                label="Phone number"
                type="tel"
                value={form.phone}
                onChange={(v) => set("phone", v)}
                error={errors.phone}
              />
            </div>
          )}
        </Screen>
      )}

      {current === "where" && (
        <Screen title="Where are you?" sub="We need this to arrange pickup and paperwork.">
          <div className="space-y-4">
            {isSupplier ? (
              <>
                <div>
                  <Label text="Country" />
                  <div className="mt-1.5 rounded-sm border border-hairline bg-canvas-soft px-3 py-2.5 text-[14px] text-ink-mute">
                    Nepal
                  </div>
                </div>
                <div>
                  <Label text="District" />
                  <select
                    value={form.district}
                    onChange={(e) => set("district", e.target.value)}
                    className={inputClass(errors.district)}
                  >
                    <option value="">Choose your district</option>
                    {PROVINCES.map((province) => (
                      <optgroup key={province} label={province}>
                        {districts
                          .filter((d) => d.province === province)
                          .map((d) => (
                            <option key={d.name} value={d.name}>
                              {d.name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                  <Error text={errors.district} />
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label text="Country" />
                  <select
                    value={form.country}
                    onChange={(e) => set("country", e.target.value)}
                    className={inputClass(errors.country)}
                  >
                    <option value="">Choose your country</option>
                    {countries.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <Error text={errors.country} />
                </div>
                <Field
                  label="City"
                  value={form.city}
                  onChange={(v) => set("city", v)}
                  error={errors.city}
                />
              </>
            )}
          </div>
        </Screen>
      )}

      {current === "bank" && (
        <Screen
          title="Where should we pay you?"
          sub="This is the account we send your earnings to."
        >
          <div className="space-y-4">
            <Field
              label="Bank name"
              value={form.bank_name}
              onChange={(v) => set("bank_name", v)}
              error={errors.bank_name}
            />
            <Field
              label="Branch"
              hint="Optional"
              value={form.branch}
              onChange={(v) => set("branch", v)}
              error={errors.branch}
            />
            <Field
              label="Account holder name"
              value={form.account_name}
              onChange={(v) => set("account_name", v)}
              error={errors.account_name}
            />
            <Field
              label="Account number"
              value={form.account_number}
              onChange={(v) => set("account_number", v)}
              error={errors.account_number}
            />
          </div>
        </Screen>
      )}

      {current === "document" && (
        <Screen
          title="Which ID document do you have?"
          sub="Pick the one you can take a clear photo of."
        >
          <Choice
            checked={idFamily === "citizenship"}
            onSelect={() => {
              setIdFamily("citizenship");
              set("id_doc_type", "citizenship");
            }}
            title="Citizenship certificate"
            body="नेपाली नागरिकताको प्रमाणपत्र. We will ask for the front and the back."
          />
          <Choice
            checked={idFamily === "nid"}
            onSelect={() => {
              setIdFamily("nid");
              set("id_doc_type", "");
            }}
            title="National identity"
            body="राष्ट्रिय परिचयपत्र. The card, or the paper you were given instead."
          />

          {idFamily === "nid" && (
            <div className="mt-5 rounded-md border border-hairline bg-canvas-soft p-4">
              <p className="text-[14px] font-medium">Do you have the card?</p>
              <p className="mt-1 text-[13px] text-ink-mute">
                Many people are still waiting for theirs and hold a paper
                document instead. Both are fine.
              </p>

              <div className="mt-4 space-y-3">
                <Choice
                  checked={form.id_doc_type === "nid_card"}
                  onSelect={() => set("id_doc_type", "nid_card")}
                  title="Yes, I have the card"
                  body="The plastic card with a chip. Front and back."
                />
                <Choice
                  checked={form.id_doc_type === "nid_paper"}
                  onSelect={() => set("id_doc_type", "nid_paper")}
                  title="No, I have the paper document"
                  body="The printed sheet with your details. One photo."
                />
              </div>
            </div>
          )}

          <Error text={errors.id_doc_type} />
        </Screen>
      )}

      {current === "documents" && (
        <Screen
          title="Upload your documents"
          sub={
            isCompany
              ? "Photos are fine. JPG, PNG or PDF, under 5 MB each."
              : "Take a photo in good light, with all four corners showing. JPG, PNG or WEBP, under 5 MB each."
          }
        >
          <div className="space-y-3">
            {needed.map((docType) => (
              <Upload
                key={docType}
                label={docLabels[docType]}
                photoOnly={!isCompany}
                doc={docs.find((d) => d.doc_type === docType) ?? null}
                error={errors[docType]}
                busy={busy}
                onPick={(file) => upload(docType, file)}
              />
            ))}
          </div>
        </Screen>
      )}

      {current === "identity" && (
        reading ? (
          <Reading />
        ) : (
          <Screen
            title="Check your details"
            sub="We read these off your document. Fix anything that is wrong."
          >
            {readNote && <Note title="Please type these in yourself" body={readNote} />}

            {nameOnDocument && nameMismatch && (
              <Note
                title="This name is not the name on your account"
                body={`Your document says "${nameOnDocument}". Your account says "${profile.full_name}". Change whichever one is wrong, or carry on if both are right.`}
              />
            )}

            <div className="space-y-8">
              {SECTIONS[docType as keyof typeof SECTIONS]?.map((section) => (
                <div key={section.title}>
                  <h2 className="text-[12px] uppercase tracking-[0.12em] text-ink-faint">
                    {section.title}
                  </h2>
                  <div className="mt-4 space-y-4">
                    {section.fields.map((field) => (
                      <Field
                        key={field}
                        label={FIELD_LABELS[field] ?? field}
                        hint={
                          workedOut(field, identity)
                            ? "We worked this out — please check"
                            : undefined
                        }
                        value={identity?.[field] ?? ""}
                        onChange={(v) =>
                          setIdentity((d) => ({ ...(d ?? {}), [field]: v }))
                        }
                        error={errors[field]}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Screen>
        )
      )}

      {current === "review" && (
        <Screen title="Check your details" sub="Make sure this is right before you send it.">
          <dl className="divide-y divide-hairline-cool border-y border-hairline-cool text-[14px]">
            <Row label="Account type" value={form.account_type} />
            {isCompany ? (
              <>
                <Row label="Company" value={form.company_name} />
                <Row label="PAN / VAT" value={form.pan_vat} />
                <Row label="Registration no." value={form.registration_number} />
              </>
            ) : (
              <Row label="Name" value={form.full_name} />
            )}
            <Row label="Phone" value={form.phone} />
            <Row
              label={isSupplier ? "District" : "City"}
              value={isSupplier ? form.district : form.city}
            />
            <Row
              label="Country"
              value={
                isSupplier
                  ? "Nepal"
                  : countries.find((c) => c.code === form.country)?.name ?? ""
              }
            />
            {isSupplier && (
              <>
                <Row label="Bank" value={form.bank_name} />
                <Row label="Account number" value={form.account_number} />
              </>
            )}
            {!isCompany && (
              <>
                <Row label="ID document" value={idDocLabels[form.id_doc_type] ?? ""} />
                <Row
                  label="Document number"
                  value={identity?.document_number ?? ""}
                />
              </>
            )}
            <Row label="Documents" value={`${docs.length} uploaded`} />
          </dl>
        </Screen>
      )}

      <Error text={errors._} />

      <div className="mt-8 space-y-3">
        <button
          type="button"
          disabled={busy || reading}
          onClick={current === "review" ? finish : next}
          className="w-full rounded-sm bg-primary px-4 py-3 text-[14px] font-medium text-ink transition hover:bg-primary-deep disabled:bg-canvas-soft disabled:text-ink-faint"
        >
          {reading
            ? "Reading…"
            : busy
            ? "Please wait…"
            : current === "review"
              ? profile.status === "approved"
                ? "Save and go back"
                : "Send for approval"
              : "Next"}
        </button>

        {step > 0 && (
          <button
            type="button"
            disabled={busy || reading}
            onClick={() => {
              setErrors({});
              setStep((s) => s - 1);
            }}
            className="w-full rounded-sm border border-hairline px-4 py-3 text-[14px] font-medium transition hover:border-ink disabled:text-ink-faint"
          >
            Back
          </button>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------

const PROVINCES = [
  "Koshi",
  "Madhesh",
  "Bagmati",
  "Gandaki",
  "Lumbini",
  "Karnali",
  "Sudurpashchim",
];

const LABELS: Record<string, string> = {
  account_type: "account type",
  full_name: "full name",
  company_name: "company name",
  pan_vat: "PAN or VAT number",
  id_number: "ID number",
  phone: "phone number",
  country: "country",
  district: "district",
  city: "city",
  bank_name: "bank name",
  account_name: "account holder name",
  account_number: "account number",
  id_doc_type: "which ID document you have",
  identity_details: "the details off your ID document",
  citizenship_front: "citizenship front",
  citizenship_back: "citizenship back",
  nid_card_front: "national ID card front",
  nid_card_back: "national ID card back",
  nid_paper: "national ID paper document",
  registration_certificate: "registration certificate",
  pan_vat_certificate: "PAN or VAT certificate",
};

const inputClass = (error?: string) =>
  `mt-1.5 w-full rounded-sm border bg-canvas px-3 py-2.5 text-[14px] outline-none placeholder:text-ink-faint focus:border-ink-mute ${
    error ? "border-[#ff2201]" : "border-hairline"
  }`;

function Screen({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-8">
      <h1 className="text-[24px] font-medium tracking-[-0.02em]">{title}</h1>
      <p className="mt-2 text-[14px] text-ink-mute">{sub}</p>
      <div className="mt-6 space-y-3">{children}</div>
    </div>
  );
}

function Label({ text, hint }: { text: string; hint?: string }) {
  return (
    <span className="flex items-baseline gap-2 text-[13px] font-medium">
      {text}
      {hint && <span className="text-[12px] font-normal text-ink-faint">{hint}</span>}
    </span>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  error,
  type = "text",
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
}) {
  return (
    <div>
      <Label text={label} hint={hint} />
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass(error)}
      />
      <Error text={error} />
    </div>
  );
}

function Choice({
  checked,
  onSelect,
  title,
  body,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`block w-full rounded-md border p-4 text-left transition ${
        checked
          ? "border-primary-deep bg-canvas-soft"
          : "border-hairline hover:border-ink-mute"
      }`}
    >
      <span className="text-[15px] font-medium">{title}</span>
      <span className="mt-1 block text-[13px] leading-[1.5] text-ink-mute">
        {body}
      </span>
    </button>
  );
}

function Upload({
  label,
  doc,
  error,
  busy,
  photoOnly,
  onPick,
}: {
  label: string;
  doc: Doc | null;
  error?: string;
  busy: boolean;
  photoOnly?: boolean;
  onPick: (file: File) => void;
}) {
  return (
    <div className="rounded-md border border-hairline p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[14px] font-medium">{label}</span>
        {doc && <span className="text-[12px] text-primary-deep">Added</span>}
      </div>

      <div className="mt-3 flex items-start gap-3">
        {doc && <Thumb url={doc.url} mime={doc.mime_type} />}

        <div className="min-w-0 flex-1">
          {doc?.file_name && (
            <p className="truncate text-[12px] text-ink-mute">{doc.file_name}</p>
          )}

          <label className="mt-2 inline-block cursor-pointer rounded-sm border border-hairline px-3 py-2 text-[13px] font-medium hover:border-ink">
            {doc ? "Replace" : "Choose file"}
            <input
              type="file"
              accept={
                photoOnly
                  ? "image/jpeg,image/png,image/webp"
                  : "image/jpeg,image/png,image/webp,application/pdf"
              }
              disabled={busy}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onPick(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      <Error text={error} />
    </div>
  );
}

const THUMB = "h-[64px] w-[64px] shrink-0 rounded-sm border border-hairline-cool";

/** A small picture of the file. For a PDF we draw its first page. */
function Thumb({ url, mime }: { url: string | null; mime: string | null }) {
  const isPdf = mime === "application/pdf";
  const [page, setPage] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    if (!url || !isPdf) return;
    let stop = false;

    (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();

      const file = await pdfjs.getDocument({ url }).promise;
      const first = await file.getPage(1);
      const size = first.getViewport({ scale: 1 });
      const viewport = first.getViewport({ scale: 128 / size.width });

      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await first.render({ canvas, viewport }).promise;
      if (!stop) setPage(canvas.toDataURL());
    })().catch((reason) => {
      // Real world PDFs fail in ways a test file never does. Say why, loudly,
      // so it can be fixed instead of guessed at.
      console.error("Could not draw a preview of this PDF:", reason);
      if (!stop) setBroken(true);
    });

    return () => {
      stop = true;
    };
  }, [url, isPdf]);

  // No preview. Let them open the file instead, so they can still check it.
  if (!url || broken) {
    const box = (
      <span
        className={`${THUMB} flex flex-col items-center justify-center gap-0.5 bg-canvas-soft text-[10px] text-ink-faint`}
      >
        <span className="font-medium">{isPdf ? "PDF" : "File"}</span>
        {url && <span className="underline">Open</span>}
      </span>
    );

    return url ? (
      <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
        {box}
      </a>
    ) : (
      box
    );
  }

  if (isPdf && !page) {
    return <span className={`${THUMB} animate-pulse bg-canvas-soft`} />;
  }

  // A plain img on purpose: these are short-lived signed links and drawn
  // canvases, which next/image cannot optimise anyway.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={isPdf ? page! : url}
      alt=""
      onError={() => setBroken(true)}
      className={`${THUMB} bg-canvas-soft object-cover`}
    />
  );
}

/**
 * True when the western date in this field was not printed on the document
 * but worked out from the Bikram Sambat one. Those are worth a second look.
 */
function workedOut(field: string, details: Record<string, string> | null) {
  const pair = DATE_PAIRS.find((p) => p.ad === field);
  return Boolean(pair) && details?.[pair!.source] === "converted";
}

/** The wait while Claude reads the photos. Five to fifteen seconds. */
function Reading() {
  return (
    <div className="mt-8 flex flex-col items-center py-16 text-center">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-hairline-cool border-t-primary-deep" />
      <p className="mt-6 text-[18px] font-medium tracking-[-0.01em]">
        Extracting details…
      </p>
      <p className="mt-2 max-w-[280px] text-[14px] text-ink-mute">
        We are reading your document. This takes about ten seconds. Please do
        not close this page.
      </p>
    </div>
  );
}

/** A neutral box for something worth reading, that does not block anyone. */
function Note({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-hairline bg-canvas-soft p-4">
      <p className="text-[14px] font-medium">{title}</p>
      <p className="mt-1 text-[13px] leading-[1.5] text-ink-mute">{body}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6 py-3">
      <dt className="text-ink-mute">{label}</dt>
      <dd className="text-right">{value || "Not set"}</dd>
    </div>
  );
}

function Error({ text }: { text?: string }) {
  if (!text) return null;
  return <p className="mt-1.5 text-[13px] text-[#ff2201]">{text}</p>;
}
