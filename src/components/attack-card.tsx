"use client";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, CircleCheck, Loader, Play, ShieldCheck, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Glass, GlassButton } from "./glass";
import { PolicyEditor } from "./policy-editor";
import type { Attack } from "@/lib/attacks";
import type { Policy } from "@/lib/policy";
import type { Status } from "@/lib/use-run";
import { ATTACKER_ADDRESS } from "@/lib/sandbox-address";

function Popover(props: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {props.open && (
        <>
          <motion.button
            aria-label="Close"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={props.onClose}
            className="fixed inset-0 z-30 cursor-default"
          />
          <Glass
            radius={20}
            bezel={16}
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="absolute bottom-[calc(100%+10px)] left-0 z-40 w-[min(360px,88vw)] p-4 text-left"
          >
            {props.children}
          </Glass>
        </>
      )}
    </AnimatePresence>
  );
}

export function AttackCard(props: {
  attack: Attack;
  draft: string;
  onDraft: (v: string) => void;
  note: string | null;
  status: Status;
  policy: Policy;
  onPolicy: (p: Policy) => void;
  model: string;
  onModel: (m: string) => void;
  onRun: () => void;
  onFind: () => void;
  genBusy: boolean;
  runBusy: boolean;
  modal?: boolean;
  onClose?: () => void;
}) {
  const { attack, draft, note, status, policy, model } = props;
  const [pop, setPop] = useState<"none" | "policy" | "model">("none");

  const dirty = draft !== attack.body;

  return (
    <Glass radius={26} bezel={20} className="w-full max-w-[780px] p-6 sm:p-7 text-left relative">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="chip chip-red">Attack payload</span>
          <span className="chip">{attack.technique}</span>
          <span className="chip">{dirty ? "Edited" : attack.source === "llm" ? "LLM-generated" : "Library variant"}</span>
        </div>
        {props.modal && (
          <button onClick={props.onClose} aria-label="Close" className="text-fg-3 hover:text-fg transition-colors">
            <X size={17} />
          </button>
        )}
      </div>

      <div className="mt-4 text-[16px] font-medium tracking-[-0.01em]">{attack.title}</div>
      <p className="mt-1 text-[13px] leading-relaxed text-fg-2">The agent’s only job is to summarize this email. Anything else it does was planted in the text below.</p>
      <div className="mt-2 text-[12px] text-fg-3 mono">inbound email · msg-105 · from {ATTACKER_ADDRESS}</div>

      <div className="relative mt-4">
        <textarea
          value={draft}
          onChange={(e) => props.onDraft(e.target.value)}
          spellCheck={false}
          rows={7}
          className="w-full resize-y min-h-[150px] rounded-2xl bg-black/25 p-4 text-[13.5px] leading-relaxed text-fg shadow-[inset_0_0_0_1px_rgba(255,255,255,.08),inset_0_1px_4px_rgba(0,0,0,.35)] outline-none transition-shadow focus:shadow-[inset_0_0_0_1px_rgba(230,241,255,.35)] placeholder:text-fg-3"
          placeholder="Write the attacker's email…"
        />
        <span className="pointer-events-none absolute right-4 bottom-3 text-[10.5px] mono text-fg-3">{draft.length} chars</span>
      </div>

      {note && <p className="mt-3 text-[12px] text-fg-3 leading-relaxed">{note}</p>}

      <div className="mt-5 flex items-center gap-2 flex-wrap relative">
        <GlassButton variant="primary" onClick={props.onRun} disabled={props.runBusy || !draft.trim()}>
          {props.runBusy ? <Loader size={14} className="animate-spin" /> : <Play size={14} />}
          {props.modal ? "Run again" : "Run attack"}
        </GlassButton>
        <GlassButton onClick={props.onFind} disabled={props.genBusy}>
          {props.genBusy ? <Loader size={14} className="animate-spin" /> : <Sparkles size={14} />}
          New variant
        </GlassButton>
        <div className="relative">
          <GlassButton aria-pressed={pop === "policy"} onClick={() => setPop(pop === "policy" ? "none" : "policy")}>
            <ShieldCheck size={14} />
            Policy
          </GlassButton>
          <Popover open={pop === "policy"} onClose={() => setPop("none")}>
            <div className="text-[13px] font-medium mb-1">Security policy</div>
            <p className="text-[11.5px] text-fg-3 leading-relaxed mb-3">Deterministic rules enforced before every tool call. No model judgment involved.</p>
            <PolicyEditor policy={policy} onPolicy={props.onPolicy} />
          </Popover>
        </div>
        {status.live && (
          <div className="relative">
            <GlassButton onClick={() => setPop(pop === "model" ? "none" : "model")}>
              <span className="text-fg-2">{model.split("/")[1] ?? model}</span>
              <ChevronDown size={13} className="text-fg-3" />
            </GlassButton>
            <Popover open={pop === "model"} onClose={() => setPop("none")}>
              <div className="text-[13px] font-medium mb-2">Model under test</div>
              <div className="space-y-0.5 max-h-[280px] overflow-auto scroll-thin">
                {status.models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { props.onModel(m.id); setPop("none"); }}
                    className="w-full flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-white/[0.06] transition-colors"
                  >
                    <span className="flex items-center gap-2 text-[12.5px]">
                      {m.id === model && <CircleCheck size={13} className="text-[color:var(--ice)]" />}
                      {m.label}
                    </span>
                    <span className="text-[10.5px] mono text-fg-3">{m.price}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[10.5px] text-fg-3">Same model runs in both realities; only the policy differs.</p>
            </Popover>
          </div>
        )}
        {!status.live && (
          <span className="text-[11px] text-fg-3 leading-snug max-w-[230px]">
            No <span className="mono">OPENROUTER_API_KEY</span> — runs use the labelled Sample Replay agent.
          </span>
        )}
      </div>
    </Glass>
  );
}

