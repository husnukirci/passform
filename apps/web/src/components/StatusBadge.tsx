export type StatusTone = "ok" | "warn" | "fail";

const TONE: Record<StatusTone, string> = {
  ok: "bg-job-ok-bg text-job-ok",
  warn: "bg-job-warn-bg text-job-warn",
  fail: "bg-job-fail-bg text-job-fail",
};

/** A status word with a tone behind it; the word carries the meaning, the colour repeats it. */
export function StatusBadge({ tone, children }: { tone: StatusTone; children: string }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}
