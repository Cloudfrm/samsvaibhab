"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function JoinForm({ role }: { role: "supplier" | "buyer" }) {
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="mt-6">
      <label className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-[1.5] text-ink-mute">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-[2px] h-[15px] w-[15px] accent-[#24b47e]"
        />
        <span>I have read and agree to the terms above.</span>
      </label>

      <div className="mt-6 space-y-2.5">
        <OAuthButton
          href={`/api/auth/login/google?role=${role}&accepted=1`}
          disabled={!accepted}
          label="Continue with Google"
          icon={<GoogleIcon />}
        />
        <OAuthButton
          href={`/api/auth/login/facebook?role=${role}&accepted=1`}
          disabled
          comingSoon
          label="Continue with Facebook"
          icon={<FacebookIcon />}
        />
      </div>

      <div className="my-6 flex items-center gap-4">
        <span className="h-px flex-1 bg-hairline-cool" />
        <span className="text-[12px] text-ink-faint">or</span>
        <span className="h-px flex-1 bg-hairline-cool" />
      </div>

      <PhoneLogin role={role} accepted={false} />
    </div>
  );
}

function PhoneLogin({
  role,
  accepted,
}: {
  role: "supplier" | "buyer";
  accepted: boolean;
}) {
  const router = useRouter();
  const [phone, setPhone] = useState("+977");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, role }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError(body.error);
    setSent(true);
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code, role, accepted }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError(body.error);
    router.push("/account");
    router.refresh();
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="text-[13px] font-medium">Continue with phone</label>
        <span className="rounded-full bg-hairline-cool px-2 py-0.5 text-[11px] text-ink-mute">
          Soon
        </span>
      </div>

      <div className="mt-2.5 space-y-2.5">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ""))}
          disabled={!accepted || sent}
          placeholder="+9779812345678"
          className="w-full rounded-sm border border-hairline bg-canvas px-3 py-2.5 text-[14px] outline-none placeholder:text-ink-faint focus:border-ink-mute disabled:bg-canvas-soft disabled:text-ink-faint"
        />

        {sent && (
          <input
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="6 digit code"
            className="w-full rounded-sm border border-hairline bg-canvas px-3 py-2.5 text-[14px] outline-none placeholder:text-ink-faint focus:border-ink-mute"
          />
        )}

        <button
          type="button"
          disabled={!accepted || busy}
          onClick={sent ? verify : send}
          className="w-full rounded-sm bg-primary px-4 py-3 text-[14px] font-medium text-ink transition hover:bg-primary-deep disabled:bg-canvas-soft disabled:text-ink-faint"
        >
          {busy
            ? "Please wait…"
            : sent
              ? "Verify and continue"
              : "Send code"}
        </button>

        {sent && !busy && (
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setCode("");
              setError(null);
            }}
            className="text-[13px] text-ink-mute hover:text-ink"
          >
            Change number
          </button>
        )}

        {error && <p className="text-[13px] text-[#ff2201]">{error}</p>}
      </div>
    </div>
  );
}

function OAuthButton({
  href,
  disabled,
  comingSoon,
  label,
  icon,
}: {
  href: string;
  disabled: boolean;
  comingSoon?: boolean;
  label: string;
  icon: React.ReactNode;
}) {
  const base =
    "flex w-full items-center justify-center gap-2.5 rounded-sm px-4 py-3 text-[14px] font-medium transition duration-200";

  if (disabled) {
    return (
      <span
        aria-disabled
        className={`${base} cursor-not-allowed border border-hairline-cool bg-canvas-soft text-ink-faint`}
      >
        <span className="opacity-40">{icon}</span>
        {label}
        {comingSoon && (
          <span className="rounded-full bg-hairline-cool px-2 py-0.5 text-[11px] text-ink-mute">
            Soon
          </span>
        )}
      </span>
    );
  }

  return (
    <a
      href={href}
      className={`${base} border border-hairline bg-canvas text-ink hover:border-ink-mute hover:shadow-[0_1px_3px_rgba(0,0,0,0.06)]`}
    >
      {icon}
      {label}
    </a>
  );
}

function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.55-5.17 3.55-8.87z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.88-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#1877F2"
        d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.96h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"
      />
    </svg>
  );
}
