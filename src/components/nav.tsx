"use client";
import Link from "next/link";
import { Cpu, FlaskConical, ShieldCheck } from "lucide-react";
import { Glass } from "./glass";

export function Nav(props: { live: boolean }) {
  return (
    <div className="fixed top-2.5 inset-x-0 z-40 flex justify-center px-3">
      <Glass radius={999} bezel={14} className="h-[54px] w-full px-2.5 flex items-center gap-2">
        <Link href="/" className="flex items-center gap-2.5 pl-1.5">
          <span className="grid size-[26px] place-items-center rounded-lg bg-white/[0.07] shadow-[inset_0_0_0_1px_rgba(255,255,255,.09)]">
            <ShieldCheck size={14} strokeWidth={2.2} className="text-[color:var(--ice)]" />
          </span>
          <span className="text-[13px] font-semibold tracking-[0.22em] pl-[1px]">OVRIDE</span>
        </Link>
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
        <span className="hidden sm:inline-flex items-center gap-1.5 pr-3 text-[11.5px] text-fg-3">
          <FlaskConical size={13} />
          Attack Lab · fictional sandbox
        </span>
      </Glass>
    </div>
  );
}
