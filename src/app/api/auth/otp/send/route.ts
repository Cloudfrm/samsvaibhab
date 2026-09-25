import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: NextRequest) {
  const { phone, role } = await request.json();

  if (role !== "supplier" && role !== "buyer") {
    return NextResponse.json(
      { error: "Choose supplier or buyer first" },
      { status: 400 },
    );
  }

  if (typeof phone !== "string" || !/^\+[1-9]\d{7,14}$/.test(phone)) {
    return NextResponse.json(
      { error: "Enter the number with country code, like +9779812345678" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: { data: { role } },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ sent: true });
}
