"use client";
import { AnimatePresence, motion } from "motion/react";
import { Cpu, Loader, ShieldCheck, Sparkles, SplitSquareHorizontal } from "lucide-react";
import { Glass, GlassButton } from "./glass";
import type { Phase } from "@/lib/use-run";

export function Nav(props: {
  live: boolean;
  phase: Phase;
  split: boolean;
  onSplit: (v: boolean) => void;
  onFind: () => void;
  genBusy: boolean;
}) {
  const busy = props.genBusy;
  return (
    <div className="fixed top-3 inset-x-0 z-40 flex justify-center px-3 sm:px-4">
      <Glass radius={999} bezel={14} className="h-[54px] w-full max-w-[1180px] px-2.5 flex items-center gap-2">
        <div className="flex items-center gap-2.5 pl-1.5">
          <span className="grid size-[26px] place-items-center rounded-lg bg-white/[0.07] shadow-[inset_0_0_0_1px_rgba(255,255,255,.09)]">
            <ShieldCheck size={14} strokeWidth={2.2} className="text-[color:var(--ice)]" />
          </span>
          <span className="text-[13px] font-semibold tracking-[0.22em] pl-[1px]">OVRIDE</span>
        </div>
        <span className="h-4 w-px bg-white/10 mx-0.5" aria-hidden />
        <div className="hidden md:flex items-center gap-1.5 text-[12.5px] text-fg-2">
          <Cpu size={13} className="text-fg-3" />
          Northwind Support Agent
        </div>
        <span className={`chip ${props.live ? "" : "!text-fg-3"}`}>
          <span className={props.live ? "live-dot" : "size-[7px] rounded-full bg-fg-3"} />
          {props.live ? "Live LLM" : "Sample Replay"}
        </span>
        <div className="flex-1" />
        <AnimatePresence initial={false}>
          {(props.phase === "running" || props.phase === "done") && (
            <motion.div initial={{ opacity: 0, width: 0, x: 8 }} animate={{ opacity: 1, width: "auto", x: 0 }} exit={{ opacity: 0, width: 0, x: 8 }} className="overflow-hidden">
              <GlassButton size="sm" aria-pressed={props.split} onClick={() => props.onSplit(!props.split)} className="!h-9">
                <SplitSquareHorizontal size={14} className={props.split ? "text-[color:var(--ice)]" : "text-fg-2"} />
                <span className="hidden sm:inline">Split Reality</span>
              </GlassButton>
            </motion.div>
          )}
        </AnimatePresence>
        <GlassButton variant="primary" onClick={props.onFind} disabled={busy}>
          {busy ? <Loader size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {busy ? "Generating…" : "Find Vulnerabilities"}
        </GlassButton>
      </Glass>
    </div>
  );
}
