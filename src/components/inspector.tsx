"use client";
// Plain-language reading of one recorded step. Nothing here is inferred beyond explain().
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Glass } from "./glass";
import type { TraceEvent } from "@/lib/events";
import { explain, fmtT, type Step } from "@/lib/trace";

const rows = [
  ["What happened", "what"],
  ["Why it was risky", "why"],
  ["What OVRIDE did", "did"],
  ["Outcome", "outcome"],
] as const;

function record(step: Step) {
  const e = step.ev;
  if (e.kind === "tool_call") {
    return {
      tool: e.tool,
      args: e.args,
      decision: e.decision,
      error: e.error ?? null,
      result: step.result ? { status: step.result.status, flags: step.result.flags, result: step.result.result } : null,
    };
  }
  if (e.kind === "run_end") return e.outcome;
  if (e.kind === "model") return { step: e.step, stopReason: e.stopReason, text: e.text, usage: e.usage ?? null };
  if (e.kind === "error") return { message: e.message };
  return { kind: e.kind };
}

export function Inspector(props: {
  step: Step | null;
  events: TraceEvent[];
  onClose: () => void;
  onNav: (dir: 1 | -1) => void;
}) {
  const { step, events, onClose, onNav } = props;
  const reduced = useReducedMotion();
  const x = step ? explain(step, events) : null;
  const branch = step?.branch === "B" ? "Protected by OVRIDE" : "Without protection";

  return (
    <AnimatePresence>
      {step && x && (
        <motion.div
          key={step.key}
          className="fixed bottom-[108px] left-0 right-0 lg:left-[var(--side)] z-30 flex justify-center px-3 sm:px-4 pointer-events-none"
          initial={reduced ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? undefined : { opacity: 0, y: 10 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
        >
          <Glass radius={28} bezel={18} tone="smoke" className="pointer-events-auto w-full max-w-[640px] p-5 sm:p-6">
            <div className="relative z-[2]">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="eyebrow">{branch}</div>
                  <h2 className="mt-1 text-[16px] font-medium tracking-[-0.02em] text-fg truncate">{step.label}</h2>
                  <div className="mt-1 mono text-[11px] text-fg-3">{fmtT(step.t)}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" aria-label="Previous event" onClick={() => onNav(-1)} className="grid size-8 place-items-center rounded-full text-fg-3 hover:text-fg hover:bg-white/[0.06]">
                    <ChevronLeft size={16} />
                  </button>
                  <button type="button" aria-label="Next event" onClick={() => onNav(1)} className="grid size-8 place-items-center rounded-full text-fg-3 hover:text-fg hover:bg-white/[0.06]">
                    <ChevronRight size={16} />
                  </button>
                  <button type="button" aria-label="Close inspector" onClick={onClose} className="grid size-8 place-items-center rounded-full text-fg-3 hover:text-fg hover:bg-white/[0.06]">
                    <X size={15} />
                  </button>
                </div>
              </div>

              <dl className="mt-4 grid gap-3.5">
                {rows.map(([label, key]) => (
                  <div key={key}>
                    <dt className="eyebrow">{label}</dt>
                    <dd className="mt-1 text-[13.5px] leading-relaxed text-fg-2">{x[key]}</dd>
                  </div>
                ))}
              </dl>

              {x.other && <p className="mt-4 text-[12.5px] leading-relaxed text-fg-3 border-t border-white/[0.06] pt-3">{x.other}</p>}

              <details className="mt-3 group">
                <summary className="cursor-pointer text-[12px] text-fg-3 hover:text-fg-2">Technical record</summary>
                <pre className="mt-2 max-h-40 overflow-auto scroll-thin rounded-xl bg-black/30 p-3 text-[11px] leading-relaxed text-fg-2 mono">
                  {JSON.stringify(record(step), null, 2)}
                </pre>
              </details>
            </div>
          </Glass>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
