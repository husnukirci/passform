import type { FitDto } from "@passform/contracts";

const STYLE: Record<FitDto["result"], string> = {
  fits: "bg-fit-ok-bg text-fit-ok",
  ask: "bg-fit-ask-bg text-fit-ask",
  no: "bg-fit-no-bg text-fit-no",
};

/** The verdict as a word plus its reason; colour only underlines what the text already says. */
export function FitBadge({ fit }: { fit: FitDto }) {
  const word = fit.result === "ask" ? `ask · needs ${fit.equipmentCode}` : fit.result;
  return (
    <span
      className={`inline-flex max-w-full flex-wrap items-baseline gap-x-2 rounded px-2 py-1 text-xs ${STYLE[fit.result]}`}
    >
      <strong className="font-semibold uppercase tracking-wide">{word}</strong>
      <span>{fit.reason}</span>
    </span>
  );
}
