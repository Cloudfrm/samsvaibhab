const WORDS: Record<string, string> = {
  incomplete: "Still filling in",
  pending: "Waiting",
  approved: "Approved",
  rejected: "Not approved",
  suspended: "On hold",
};

const LOOK: Record<string, string> = {
  incomplete: "bg-adm-bone text-adm-mute",
  pending: "bg-adm-bone text-adm-body",
  approved: "bg-adm-green text-white",
  rejected: "bg-adm-orange text-white",
  suspended: "bg-adm-dark text-white",
};

/** Where an account stands, in words rather than a database value. */
export function StatusChip({
  status,
  sentBack = 0,
}: {
  status: string;
  sentBack?: number;
}) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span
        className={`inline-block rounded-full px-2.5 py-1 text-[12px] ${
          LOOK[status] ?? "bg-adm-bone text-adm-body"
        }`}
      >
        {WORDS[status] ?? status}
      </span>

      {/* Three tries and still not right. This is the one that needs a person. */}
      {sentBack >= 3 && (
        <span className="inline-block rounded-full bg-adm-orange px-2.5 py-1 text-[12px] text-white">
          Stuck · sent back {sentBack} times
        </span>
      )}
    </span>
  );
}
