"use client";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import type { Policy } from "@/lib/policy";

function Switch(props: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string; id: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={props.id} className="min-w-0">
        <div className="text-[12.5px] text-fg-2">{props.label}</div>
        {props.hint && <div className="mt-0.5 text-[11.5px] text-fg-3 leading-relaxed">{props.hint}</div>}
      </label>
      <button
        id={props.id}
        role="switch"
        aria-checked={props.on}
        onClick={() => props.onChange(!props.on)}
        className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200 ${props.on ? "bg-[color:var(--mint)]/35" : "bg-white/10"} shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]`}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className={`absolute top-[3px] size-4 rounded-full ${props.on ? "left-[19px] bg-[color:var(--mint)]" : "left-[3px] bg-fg-2"}`}
        />
      </button>
    </div>
  );
}

/** The policy controls, shared by the Lab popover and the Policy page. `full` adds rule descriptions. */
export function PolicyEditor({ policy, onPolicy, full }: { policy: Policy; onPolicy: (p: Policy) => void; full?: boolean }) {
  const [destDraft, setDestDraft] = useState<string | null>(null);
  useEffect(() => setDestDraft(null), [policy]);
  return (
    <>
      <div className={full ? "space-y-5" : "space-y-2.5"}>
        <Switch
          id="p-egress"
          on={policy.blockConfidentialEgress}
          label="Block confidential egress (OVR-001)"
          hint={full ? "Blocks any message that contains customer records and is going to a destination that isn't approved." : undefined}
          onChange={(v) => onPolicy({ ...policy, blockConfidentialEgress: v })}
        />
        <Switch
          id="p-dest"
          on={policy.blockUnapprovedDestinations}
          label="Block unapproved destinations (OVR-002)"
          hint={full ? "Blocks every message to a destination not on the list below, even when no confidential data is detected." : undefined}
          onChange={(v) => onPolicy({ ...policy, blockUnapprovedDestinations: v })}
        />
      </div>
      <div className={full ? "mt-6" : "mt-3.5"}>
        <label htmlFor="p-allowed" className="block text-[11.5px] text-fg-3 mb-1.5">Approved destinations (comma-separated; @domain matches any address there)</label>
        <input
          id="p-allowed"
          value={destDraft ?? policy.allowedDestinations.join(", ")}
          onChange={(e) => setDestDraft(e.target.value)}
          onBlur={() => {
            const list = (destDraft ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20);
            if (destDraft !== null && list.length) onPolicy({ ...policy, allowedDestinations: list });
            setDestDraft(null);
          }}
          className="w-full rounded-lg bg-black/25 px-3 h-9 text-[12.5px] mono shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)] outline-none focus:shadow-[inset_0_0_0_1px_rgba(230,241,255,.35)]"
        />
      </div>
    </>
  );
}
