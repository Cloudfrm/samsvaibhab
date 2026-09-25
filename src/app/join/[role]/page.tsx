import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { Markdown } from "@/components/Markdown";
import { JoinForm } from "@/components/JoinForm";

const COPY = {
  supplier: {
    heading: "Join as a supplier",
    sub: "For farmers, cooperatives and traders in Nepal.",
    slug: "terms-supplier",
  },
  buyer: {
    heading: "Join as a buyer",
    sub: "For importers, wholesalers and local buyers, in Nepal or abroad.",
    slug: "terms-buyer",
  },
} as const;

export default async function JoinPage({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const { role } = await params;

  if (role !== "supplier" && role !== "buyer") notFound();

  const copy = COPY[role];
  const supabase = await createClient();
  const { data: page } = await supabase
    .from("pages")
    .select("title, content")
    .eq("slug", copy.slug)
    .single();

  return (
    <>
      <header className="px-8 py-7">
        <Link
          href="/"
          className="text-[13px] text-ink-faint transition-colors hover:text-ink"
        >
          ← Back
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-[420px]">
          <h1 className="text-[24px] font-medium tracking-[-0.02em]">
            {copy.heading}
          </h1>
          <p className="mt-2 text-[14px] text-ink-mute">{copy.sub}</p>

          <div className="mt-8 rounded-lg border border-hairline-cool bg-canvas-soft p-5">
            <p className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">
              {page?.title ?? "Terms and conditions"}
            </p>
            <div className="mt-3 max-h-[200px] overflow-y-auto pr-2">
              {page ? (
                <Markdown text={page.content} />
              ) : (
                <p className="text-[13px] text-ink-mute">
                  Terms are not available right now.
                </p>
              )}
            </div>
          </div>

          <JoinForm role={role} />
        </div>
      </main>
    </>
  );
}
