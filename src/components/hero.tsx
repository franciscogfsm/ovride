"use client";
// The Lab's empty state: the agent under test, its execution path, and the two ways to begin.
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Bot, FileText, Library, Loader, Mail, Search, Send, Sparkles, Wrench } from "lucide-react";
import { Glass, GlassButton } from "./glass";
import type { Status } from "@/lib/use-run";

const stages = [
  { icon: Mail, label: "External Input", sub: "attacker email" },
  { icon: Bot, label: "AI Agent", sub: "summarize request" },
  { icon: Wrench, label: "Tool Action", sub: "live tool calls" },
  { icon: Send, label: "Outcome", sub: "policy gate" },
];

export function Hero(props: { status: Status | null; onFind: () => void; genBusy: boolean; note?: string | null }) {
  const rm = useReducedMotion();
  const s = props.status;
  return (
    <Glass radius={26} bezel={20} tone="smoke" className="p-6 sm:p-8 text-left">
      <div className="relative z-[2]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5">
            <span className="grid size-[42px] place-items-center rounded-2xl bg-white/[0.07] shadow-[inset_0_0_0_1px_rgba(255,255,255,.09)]">
              <Bot size={21} className="text-fg" />
            </span>
            <div>
              <div className="text-[14.5px] font-medium">Northwind Customer-Support Agent</div>
              <div className="text-[12.5px] text-fg-3">Reads inbound email, posts a summary to #support-triage.</div>
            </div>
          </div>
          <span className={`chip ${s?.live ? "chip-mint" : ""}`}>{s ? (s.live ? "Live LLM execution" : "Sample Replay mode") : "…"}</span>
        </div>

        <div className="mt-8 flex items-center justify-between gap-1">
          {stages.map((st, i) => (
            <div key={st.label} className="flex items-center justify-between gap-1 flex-1 last:flex-none">
              <motion.div
                className="flex flex-col items-center gap-1.5 px-1"
                initial={rm ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 * i, type: "spring", stiffness: 160, damping: 18 }}
              >
                <span className="grid size-[44px] place-items-center rounded-full bg-white/[0.045] shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
                  <st.icon size={17} className="text-fg-2" />
                </span>
                <div className="text-center">
                  <div className="text-[10.5px] font-medium tracking-wide text-fg-2">{st.label}</div>
                  <div className="text-[9.5px] text-fg-3 hidden sm:block">{st.sub}</div>
                </div>
              </motion.div>
              {i < stages.length - 1 && (
                <span className="relative h-px flex-1 mb-8 bg-gradient-to-r from-white/15 to-white/[0.04] overflow-hidden" aria-hidden>
                  {!rm && (
                    <motion.span
                      className="absolute inset-y-0 w-10 bg-gradient-to-r from-transparent via-[color:var(--ice)]/60 to-transparent"
                      animate={{ left: ["-20%", "110%"] }}
                      transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.5, ease: "easeInOut" }}
                    />
                  )}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-2">
          <GlassButton variant="primary" onClick={props.onFind} disabled={props.genBusy}>
            {props.genBusy ? <Loader size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {props.genBusy ? "Generating…" : "Generate an attack"}
            <ArrowRight size={14} className="opacity-60" />
          </GlassButton>
          <Link href="/attacks" className="btn btn-glass h-10 px-4 text-[13.5px] gap-2">
            <Library size={14} />
            Pick from library
          </Link>
        </div>
        {props.note && <p className="mt-3 text-[12px] text-fg-3">{props.note}</p>}

        <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/[0.06] pt-4">
          {([
            [Mail, "Simulated inbox"],
            [Search, "Customer database"],
            [FileText, "Knowledge base"],
            [Send, "Messaging"],
          ] as const).map(([Icon, label]) => (
            <span key={label} className="inline-flex items-center gap-1.5 text-[11.5px] text-fg-3">
              <Icon size={12} />
              {label}
            </span>
          ))}
          <span className="sm:ml-auto text-[11px] text-fg-3">Fictional sandbox · no real accounts or data</span>
        </div>
      </div>
    </Glass>
  );
}
