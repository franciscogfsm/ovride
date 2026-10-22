"use client";
// One reality lane: header, the flow, the agent's live thought, observed sends,
// and the event log. Every row maps to a recorded event.
import { AnimatePresence, motion } from "motion/react";
import { Bot, CircleCheck, MessageSquare, Send as SendIcon, ShieldCheck, TriangleAlert, Wrench } from "lucide-react";
import { Flow } from "./flow";
import type { Branch, TraceEvent } from "@/lib/events";
import { fmtT, verdictLabel, type LaneView, type Send, type Step, type Tone } from "@/lib/trace";

const dot: Record<Tone, string> = {
  neutral: "bg-fg-3",
  danger: "bg-[color:var(--red)] shadow-[0_0_8px_rgba(239,122,104,.8)]",
  safe: "bg-[color:var(--mint)] shadow-[0_0_8px_rgba(127,224,191,.8)]",
  warn: "bg-[color:var(--red)]/70",
};

function SendChip(props: { s: Send; onOpen: () => void }) {
  const { s } = props;
  return (
    <motion.button
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 26 }}
      onClick={props.onOpen}
      className={`chip cursor-pointer hover:brightness-125 transition ${s.blocked ? "chip-mint" : s.approved ? "" : "chip-red"}`}
      title={s.blocked ? "Blocked by policy — click to inspect" : s.approved ? "Approved destination" : "Executed — confidential data left the company"}
    >
      {s.blocked ? <ShieldCheck size={12} /> : <SendIcon size={12} />}
      {s.blocked
        ? `Blocked → ${s.to}`
        : s.leaked
          ? `${s.records} record${s.records === 1 ? "" : "s"} → ${s.to}`
          : `→ ${s.to}`}
    </motion.button>
  );
}

function stepIcon(step: Step) {
  switch (step.ev.kind) {
    case "model": return <MessageSquare size={11.5} />;
    case "tool_call": return <Wrench size={11.5} />;
    case "run_end": return <CircleCheck size={11.5} />;
    default: return <TriangleAlert size={11.5} />;
  }
}

export function Lane(props: {
  branch: Branch;
  v: LaneView;
  steps: Step[];
  events: TraceEvent[];
  running: boolean;
  onStep: (s: Step) => void;
  onSendStep: (key: string) => void;
}) {
  const { v, branch } = props;
  const A = branch === "A";
  const outcomeTone = v.outcome ? (v.outcome.verdict === "compromised" ? "chip-red" : v.outcome.verdict === "defended" ? "chip-mint" : "") : "";
  const visible = props.steps.slice(-30);

  return (
    <div className="card p-5 sm:p-6 flex flex-col gap-4 min-h-[340px] w-full">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className={`text-[11px] font-semibold tracking-[0.16em] ${A ? "text-[color:var(--red)]/90" : "text-[color:var(--mint)]/90"}`}>
            {A ? "WITHOUT PROTECTION" : "PROTECTED BY OVRIDE"}
          </span>
          <span className="chip !h-[19px] !text-[10.5px]">{v.mode === "live" ? "Live" : "Sample Replay"}</span>
        </div>
        <AnimatePresence mode="popLayout">
          {v.outcome && (
            <motion.span
              key={v.outcome.verdict}
              initial={{ opacity: 0, y: -6, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 24 }}
              className={`chip ${outcomeTone}`}
            >
              {verdictLabel(v.outcome.verdict)}
            </motion.span>
          )}
          {!v.outcome && v.started && (
            <motion.span key="run" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[11px] mono text-fg-3">
              step {v.step}{v.tokens ? ` · ${v.tokens >= 1000 ? `${(v.tokens / 1000).toFixed(1)}k` : v.tokens} tokens${v.cost ? ` · $${v.cost.toFixed(4)}` : ""}` : ""}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {v.outcome && (
        <p className="text-[15px] leading-snug tracking-[-0.015em] text-fg">{v.outcome.summary}</p>
      )}
      {v.outcome?.taskCompleted && (
        <p className="text-[12px] text-fg-3 -mt-2">The legitimate summary still reached #support-triage.</p>
      )}

      <Flow v={v} running={props.running} />

      <div className="min-h-[18px]">
        <AnimatePresence mode="wait">
          {v.thought && (
            <motion.p
              key={v.thought.slice(0, 80)}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="text-[12.5px] text-fg-2/75 italic leading-snug line-clamp-2 max-w-[95%]"
            >
              “{v.thought}”
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {v.sends.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {v.sends.map((s) => (
            <SendChip key={s.key} s={s} onOpen={() => props.onSendStep(s.key)} />
          ))}
        </div>
      )}

      {v.error && (
        <div className="chip chip-red w-fit max-w-full">
          <TriangleAlert size={12} />
          <span className="truncate">{v.error}</span>
        </div>
      )}

      <div className="mt-auto pt-3 border-t border-white/[0.06] min-h-[120px]">
        <div className="max-h-[168px] overflow-auto scroll-thin pr-1 space-y-[3px]">
          <AnimatePresence initial={false}>
            {visible.map((s) => (
              <motion.button
                layout
                key={s.key}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => props.onStep(s)}
                className={`w-full flex items-center gap-2.5 rounded-lg px-2 py-[7px] text-left cursor-pointer transition-colors hover:bg-white/[0.05] ${s.tone === "danger" || s.tone === "safe" ? "bg-white/[0.03]" : ""}`}
              >
                <span className={`size-[5px] shrink-0 rounded-full ${dot[s.tone]}`} />
                <span className="text-fg-3 shrink-0">{stepIcon(s)}</span>
                <span className={`text-[12px] truncate ${s.tone === "danger" ? "text-[color:var(--red)]/90" : s.tone === "safe" ? "text-[color:var(--mint)]/90" : "text-fg-2"}`}>
                  {s.label}
                </span>
                <span className="ml-auto text-[10px] mono text-fg-3 shrink-0">{fmtT(s.t)}</span>
              </motion.button>
            ))}
          </AnimatePresence>
          {!visible.length && (
            <div className="flex items-center gap-2 text-[12px] text-fg-3 px-2 py-1">
              <Bot size={13} />
              {props.running ? "waiting for the agent…" : v.started ? "no events" : "—"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
