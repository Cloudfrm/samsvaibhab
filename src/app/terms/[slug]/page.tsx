import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { Markdown } from "@/components/Markdown";

export default async function TermsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: page } = await supabase
    .from("pages")
    .select("title, content, version, updated_at")
    .eq("slug", slug)
    .single();

  if (!page) notFound();

  return (
    <main className="mx-auto w-full max-w-[720px] flex-1 px-6 py-12 sm:py-20">
      <Link href="/" className="text-[14px] text-ink-mute hover:text-ink">
        ← Back
      </Link>
      <h1 className="mt-8 text-[26px] font-medium tracking-[-0.02em]">
        {page.title}
      </h1>
      <p className="mt-2 text-[13px] text-ink-faint">
        Version {page.version} · updated{" "}
        {new Date(page.updated_at).toLocaleDateString()}
      </p>
      <div className="mt-8">
        <Markdown text={page.content} />
      </div>
    </main>
  );
}
