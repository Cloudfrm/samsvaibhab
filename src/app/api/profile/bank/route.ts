import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getCurrentProfile } from "@/lib/auth";
import { missingFromBank, type BankAccount } from "@/lib/profile";

const SELECT = "bank_name, branch, account_name, account_number";

export async function GET() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("payment_accounts")
    .select(SELECT)
    .eq("profile_id", profile.id)
    .eq("is_primary", true)
    .maybeSingle();

  return NextResponse.json({ bank: data ?? null });
}

export async function PUT(request: NextRequest) {
  const profile = await getCurrentProfile();

  if (!profile) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  // Only suppliers are paid out by us, so only they keep a bank account.
  if (profile.role !== "supplier") {
    return NextResponse.json(
      { error: "Bank details are for suppliers only" },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const text = (value: unknown) => {
    const trimmed = String(value ?? "").trim();
    return trimmed.length === 0 ? null : trimmed;
  };

  const bank: BankAccount = {
    bank_name: text(body.bank_name),
    branch: text(body.branch),
    account_name: text(body.account_name),
    account_number: text(body.account_number),
  };

  const missing = missingFromBank(bank);

  if (missing.length > 0) {
    return NextResponse.json(
      { error: "Some bank details are missing", missing },
      { status: 400 },
    );
  }

  if (!/^[0-9A-Za-z-]{5,34}$/.test(bank.account_number!)) {
    return NextResponse.json(
      { error: "Account number looks wrong", errors: { account_number: "Use 5 to 34 letters or numbers" } },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("payment_accounts")
    .select("id")
    .eq("profile_id", profile.id)
    .eq("is_primary", true)
    .maybeSingle();

  const row = { ...bank, profile_id: profile.id, method: "bank", is_primary: true };

  const { data, error } = existing
    ? await admin.from("payment_accounts").update(row).eq("id", existing.id).select(SELECT).single()
    : await admin.from("payment_accounts").insert(row).select(SELECT).single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ bank: data });
}
