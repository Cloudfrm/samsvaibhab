export function Markdown({ text }: { text: string }) {
  return (
    <div className="space-y-3">
      {text.split("\n").map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith("## "))
          return (
            <h3 key={i} className="pt-2 text-[16px] font-medium">
              {trimmed.slice(3)}
            </h3>
          );
        if (trimmed.startsWith("- "))
          return (
            <p key={i} className="pl-4 text-[14px] leading-[1.6] text-ink-mute">
              • {trimmed.slice(2)}
            </p>
          );
        return (
          <p key={i} className="text-[14px] leading-[1.6] text-ink-mute">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}
