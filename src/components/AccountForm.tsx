"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Profile } from "@/lib/auth";

type Country = { code: string; name: string };
type District = { name: string; province: string };
type Bank = {
  bank_name: string | null;
  branch: string | null;
  account_name: string | null;
  account_number: string | null;
};
type Doc = { id: string; doc_type: string; file_name: string | null };

type Props = {
  profile: Profile;
  bank: Bank | null;
  documents: Doc[];
  countries: Country[];
  districts: District[];
  requiredDocs: Record<string, string[]>;
  docLabels: Record<string, string>;
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
}: Props) {
  const router = useRouter();

  const [profile, setProfile] = useState(initialProfile);
  const [docs, setDocs] = useState(initialDocs);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    account_type: initialProfile.account_type ?? "",
    full_name: initialProfile.full_name ?? "",
    company_name: initialProfile.company_name ?? "",
    pan_vat: initialProfile.pan_vat ?? "",
    registration_number: initialProfile.registration_number ?? "",
    id_number: initialProfile.id_number ?? "",
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
    return [...(profile.role ? [] : ["role"]), ...list, "documents", "review"];
  }, [isSupplier, profile.role]);

  const current = steps[step];
  const needed = form.account_type ? requiredDocs[form.account_type] : [];

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
              id_number: form.id_number,
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
                  <Field
                    label="Citizenship or passport number"
                    value={form.id_number}
                    onChange={(v) => set("id_number", v)}
                    error={errors.id_number}
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

      {current === "documents" && (
        <Screen
          title="Upload your documents"
          sub="Photos are fine. JPG, PNG or PDF, under 5 MB each."
        >
          <div className="space-y-3">
            {needed.map((docType) => (
              <Upload
                key={docType}
                label={docLabels[docType]}
                fileName={docs.find((d) => d.doc_type === docType)?.file_name ?? null}
                error={errors[docType]}
                busy={busy}
                onPick={(file) => upload(docType, file)}
              />
            ))}
          </div>
        </Screen>
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
              <>
                <Row label="Name" value={form.full_name} />
                <Row label="ID number" value={form.id_number} />
              </>
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
            <Row label="Documents" value={`${docs.length} uploaded`} />
          </dl>
        </Screen>
      )}

      <Error text={errors._} />

      <div className="mt-8 space-y-3">
        <button
          type="button"
          disabled={busy}
          onClick={current === "review" ? finish : next}
          className="w-full rounded-sm bg-primary px-4 py-3 text-[14px] font-medium text-ink transition hover:bg-primary-deep disabled:bg-canvas-soft disabled:text-ink-faint"
        >
          {busy
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
            disabled={busy}
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
  id_front: "ID front",
  id_back: "ID back",
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
  fileName,
  error,
  busy,
  onPick,
}: {
  label: string;
  fileName: string | null;
  error?: string;
  busy: boolean;
  onPick: (file: File) => void;
}) {
  return (
    <div className="rounded-md border border-hairline p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[14px] font-medium">{label}</span>
        {fileName && <span className="text-[12px] text-primary-deep">Added</span>}
      </div>

      {fileName && (
        <p className="mt-1 truncate text-[12px] text-ink-mute">{fileName}</p>
      )}

      <label className="mt-3 inline-block cursor-pointer rounded-sm border border-hairline px-3 py-2 text-[13px] font-medium hover:border-ink">
        {fileName ? "Replace" : "Choose file"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          disabled={busy}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onPick(file);
            e.target.value = "";
          }}
        />
      </label>

      <Error text={error} />
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
