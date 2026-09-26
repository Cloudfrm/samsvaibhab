"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Profile } from "@/lib/auth";

type Errors = Record<string, string>;

const LABELS: Record<string, string> = {
  full_name: "contact person name",
  company_name: "company or business name",
  phone: "contact number",
  pin_code: "pin code",
};

export function BuyerOnboardingForm({ profile }: { profile: Profile }) {
  const router = useRouter();

  const [form, setForm] = useState({
    full_name: profile.full_name ?? "",
    company_name: profile.company_name ?? "",
    phone: profile.phone ?? "",
    delivery_location: profile.delivery_location ?? "",
    state: profile.state ?? "",
    city: profile.city ?? "",
    pin_code: profile.pin_code ?? "",
    special_requirement: profile.special_requirement ?? "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    setBusy(true);
    setErrors({});

    const saved = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const savedBody = await saved.json();

    if (!saved.ok) {
      setBusy(false);
      return setErrors(savedBody.errors ?? { _: savedBody.error });
    }

    const sent = await fetch("/api/profile/submit", { method: "POST" });
    const sentBody = await sent.json();
    setBusy(false);

    if (!sent.ok) {
      const missing = sentBody.missing?.details ?? [];
      return setErrors({
        _: missing.length
          ? `Still missing: ${missing.map((f: string) => LABELS[f] ?? f).join(", ")}`
          : sentBody.error,
      });
    }

    router.push("/buyer");
    router.refresh();
  };

  return (
    <main className="mx-auto w-full max-w-[460px] flex-1 px-6 pb-12">
      <div className="mt-8">
        <h1 className="text-[24px] font-medium tracking-[-0.02em]">
          Tell us about your business
        </h1>
        <p className="mt-2 text-[14px] text-ink-mute">
          This is all we need to get you started.
        </p>

        <div className="mt-6 space-y-4">
          <Field
            label="Contact person name"
            value={form.full_name}
            onChange={(v) => set("full_name", v)}
            error={errors.full_name}
          />
          <Field
            label="Company / business name"
            value={form.company_name}
            onChange={(v) => set("company_name", v)}
            error={errors.company_name}
          />
          <Field
            label="Contact number"
            hint="Mobile or WhatsApp"
            type="tel"
            value={form.phone}
            onChange={(v) => set("phone", v)}
            error={errors.phone}
          />
          <Field
            label="Delivery location"
            hint="Optional"
            value={form.delivery_location}
            onChange={(v) => set("delivery_location", v)}
            error={errors.delivery_location}
          />
          <Field
            label="State"
            hint="Optional"
            value={form.state}
            onChange={(v) => set("state", v)}
            error={errors.state}
          />
          <Field
            label="City"
            hint="Optional"
            value={form.city}
            onChange={(v) => set("city", v)}
            error={errors.city}
          />
          <Field
            label="Pin code"
            value={form.pin_code}
            onChange={(v) => set("pin_code", v)}
            error={errors.pin_code}
          />
          <Field
            label="Any special requirement"
            hint="Optional"
            value={form.special_requirement}
            onChange={(v) => set("special_requirement", v)}
            error={errors.special_requirement}
          />
        </div>

        <Error text={errors._} />

        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="mt-8 w-full rounded-sm bg-primary px-4 py-3 text-[14px] font-medium text-ink transition hover:bg-primary-deep disabled:bg-canvas-soft disabled:text-ink-faint"
        >
          {busy ? "Please wait…" : "Submit"}
        </button>
      </div>
    </main>
  );
}

const inputClass = (error?: string) =>
  `mt-1.5 w-full rounded-sm border bg-canvas px-3 py-2.5 text-[14px] outline-none placeholder:text-ink-faint focus:border-ink-mute ${
    error ? "border-[#ff2201]" : "border-hairline"
  }`;

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
      <span className="flex items-baseline gap-2 text-[13px] font-medium">
        {label}
        {hint && <span className="text-[12px] font-normal text-ink-faint">{hint}</span>}
      </span>
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

function Error({ text }: { text?: string }) {
  if (!text) return null;
  return <p className="mt-1.5 text-[13px] text-[#ff2201]">{text}</p>;
}
