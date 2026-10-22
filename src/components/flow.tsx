"use client";
// The execution flow: External Input → AI Agent → Tool Action → Outcome.
// Everything shown is a pure derivation of the branch's recorded events (via laneView).
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Bot, Mail, Send, ShieldCheck, Wrench } from "lucide-react";
import type { LaneView, Stage, Tone } from "@/lib/trace";

const toneColor: Record<Tone, string> = {
  neutral: "var(--ice)",
  danger: "var(--red)",
  safe: "var(--mint)",
  warn: "var(--red)",
};

const STAGE_ICON = { input: Mail, agent: Bot, tool: Wrench, outcome: Send } as const;

/** The moment OVRIDE blocks a call: shield rings burst out of the Tool node. */
function Intercept() {
  const rm = useReducedMotion();
  if (rm) return null;
  return (
    <>
      {[0, 1].map((i) => (
        <motion.span
          key={i}
          initial={{ scale: 0.5, opacity: 0.95 }}
          animate={{ scale: 2.15, opacity: 0 }}
          transition={{ duration: 0.85, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_0_0_1.5px_rgba(127,224,191,.8)]"
        />
      ))}
      <motion.span
        initial={{ scale: 0, opacity: 1 }}
        animate={{ scale: 1, opacity: [1, 1, 0] }}
        transition={{ duration: 1.1, times: [0, 0.55, 1] }}
        className="pointer-events-none absolute inset-0 grid place-items-center"
      >
        <ShieldCheck size={17} className="text-[color:var(--mint)]" />
      </motion.span>
    </>
  );
}

function Node(props: {
  stage: Stage;
  active: boolean;
  danger: boolean;
  safe: boolean;
  intercept?: boolean;
  title: string;
  sub: string;
}) {
  const Icon = STAGE_ICON[props.stage];
  const state = props.danger ? "danger" : props.safe ? "safe" : props.active ? "active" : "idle";
  return (
    <div className="w-[104px] shrink-0 flex flex-col items-center gap-2">
      <motion.div
        animate={state === "active" ? { scale: 1.06 } : state === "idle" ? { scale: 0.98 } : { scale: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 20 }}
        className={`relative grid size-[64px] place-items-center rounded-full bg-[color:var(--panel)] transition-shadow duration-500 ${
          state === "idle" ? "shadow-[inset_0_0_0_1px_rgba(255,255,255,.09)]" :
          state === "active" ? "shadow-[inset_0_0_0_1px_rgba(230,241,255,.55),0_0_28px_-4px_rgba(230,241,255,.35)]" :
          state === "danger" ? "shadow-[inset_0_0_0_1px_rgba(239,122,104,.65),0_0_30px_-6px_rgba(239,122,104,.5)]" :
          "shadow-[inset_0_0_0_1px_rgba(127,224,191,.65),0_0_30px_-6px_rgba(127,224,191,.5)]"
        }`}
      >
        <Icon size={22} strokeWidth={1.75} className={
          state === "idle" ? "text-fg-3" :
          state === "danger" ? "text-[color:var(--red)]" :
          state === "safe" ? "text-[color:var(--mint)]" : "text-fg"
        } />
        {props.intercept && <Intercept />}
      </motion.div>
      <div className="text-center leading-tight">
        <div className={`text-[11px] font-medium tracking-[0.08em] uppercase ${state === "idle" ? "text-fg-3" : "text-fg"}`}>{props.title}</div>
        <div className="text-[11px] text-fg-3 max-w-[104px] truncate">{props.sub}</div>
      </div>
    </div>
  );
}

function Edge(props: { active: boolean; pulse?: { id: string; tone: Tone; intercepted: boolean } }) {
  const rm = useReducedMotion();
  return (
    <div className="relative flex-1 self-start mt-[32px] h-px min-w-[18px]">
      <div className="absolute inset-0 bg-gradient-to-r from-white/15 to-white/[0.05] rounded-full" />
      <div className={`absolute inset-0 rounded-full transition-colors duration-500 ${props.active ? "bg-[color:var(--ice)]/30" : ""}`} />
      <AnimatePresence>
        {props.pulse && (
          <motion.span
            key={props.pulse.id}
            initial={{ left: "0%", opacity: 1 }}
            animate={{ left: "100%", opacity: rm ? 1 : 0.35 }}
            exit={{ opacity: 0 }}
            transition={{ duration: rm ? 0.01 : 0.5, ease: [0.3, 0, 0.2, 1] }}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-[7px] rounded-full"
            style={{ background: toneColor[props.pulse.tone], boxShadow: `0 0 12px 1px ${toneColor[props.pulse.tone]}` }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export function Flow(props: { v: LaneView; running: boolean }) {
  const { v } = props;
  const active = (s: Stage) => v.active === s && props.running;
  const toolDanger = v.call?.tone === "danger" && v.call.result?.status === "executed";
  const intercepted = v.pulse?.intercepted === true;
  const outcomeSafe = v.sends.some((s) => s.blocked);
  const outcomeDanger = v.sends.some((s) => !s.blocked && !s.approved && s.leaked > 0);
  const modelShort = v.mode === "live" ? (v.model?.split("/")[1] ?? "live") : "scripted";
  const toolSub = v.call && v.call.ev.kind === "tool_call" ? v.call.ev.tool : "—";
  return (
    <div className="flex items-start w-full select-none">
      <Node stage="input" active={active("input")} danger={v.email?.untrusted === true} safe={false}
        title="External Input" sub={v.email?.subject ?? "the email"} />
      <Edge active={active("input")} pulse={v.pulse?.edge === "in" ? v.pulse : undefined} />

      <Node stage="agent" active={active("agent")} danger={false} safe={false}
        title="AI Agent" sub={v.started ? modelShort : "—"} />
      <Edge active={active("agent")} pulse={v.pulse?.edge === "act" && !intercepted ? v.pulse : undefined} />

      <Node stage="tool" active={active("tool")} danger={!!toolDanger} safe={intercepted} intercept={intercepted}
        title="Tool Action" sub={toolSub} />
      <Edge active={active("tool")} pulse={v.pulse?.edge === "out" ? v.pulse : undefined} />

      <Node stage="outcome" active={active("outcome")} danger={outcomeDanger} safe={outcomeSafe}
        title="Outcome" sub={v.outcome ? v.outcome.verdict : "—"} />
    </div>
  );
}
