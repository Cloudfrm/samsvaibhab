import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { error } = await supabase.auth.getUser();

  if (error && error.status !== 400 && error.status !== 401) {
    return NextResponse.json(
      { connected: false, message: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ connected: true });
}
