"use client";
// Small shared pieces for the platform pages.
import Link from "next/link";
import { animate, motion, useInView, useReducedMotion } from "motion/react";
import { ShieldAlert, ShieldCheck, ShieldQuestion, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Outcome } from "@/lib/events";
import { verdictLabel } from "@/lib/trace";

/** A number that counts up once it scrolls into view. */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString() }: { value: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const rm = useReducedMotion();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (rm) return setN(value);
    const c = animate(0, value, { duration: 0.9, ease: [0.16, 1, 0.3, 1], onUpdate: setN });
    return () => c.stop();
  }, [inView, value, rm]);
  return <span ref={ref} className="tabular-nums">{format(n)}</span>;
}

export function Stat(props: { label: string; value: number; format?: (n: number) => string; hint?: ReactNode; icon: LucideIcon; tone?: "red" | "mint"; i?: number }) {
  const Icon = props.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: (props.i ?? 0) * 0.05, type: "spring", stiffness: 200, damping: 24 }}
      className="card p-5"
    >
      <div className="flex items-center justify-between text-[12px] text-fg-3">
        {props.label}
        <Icon size={14} className={props.tone === "red" ? "text-[color:var(--red)]" : props.tone === "mint" ? "text-[color:var(--mint)]" : ""} />
      </div>
      <div className="mt-3 text-[30px] font-semibold tracking-[-0.03em] leading-none">
        <CountUp value={props.value} format={props.format} />
      </div>
      {props.hint && <div className="mt-2 text-[11.5px] text-fg-3">{props.hint}</div>}
    </motion.div>
  );
}

export function Verdict({ o }: { o?: Outcome }) {
  if (!o) return <span className="chip"><ShieldQuestion size={12} />Pending</span>;
  const v = o.verdict;
  const cls = v === "compromised" ? "chip-red" : v === "defended" ? "chip-mint" : "";
  const Icon = v === "compromised" ? ShieldAlert : v === "incomplete" ? ShieldQuestion : ShieldCheck;
  return <span className={`chip ${cls}`}><Icon size={12} />{verdictLabel(v)}</span>;
}

export function Empty(props: { icon: LucideIcon; title: string; sub: string; action?: { href: string; label: string } }) {
  const Icon = props.icon;
  return (
    <div className="card p-10 grid place-items-center text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-white/[0.05] shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
        <Icon size={20} className="text-fg-3" />
      </span>
      <div className="mt-4 text-[14px] font-medium">{props.title}</div>
      <p className="mt-1 text-[12.5px] text-fg-3 max-w-[360px]">{props.sub}</p>
      {props.action && (
        <Link href={props.action.href} className="btn btn-primary h-9 px-4 text-[13px] mt-5">{props.action.label}</Link>
      )}
    </div>
  );
}

export function ago(t: number) {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(t).toLocaleDateString();
}

/** Animated mount for list rows and cards, staggered by index. */
export function Rise({ i = 0, children, className = "" }: { i?: number; children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i, 12) * 0.035, type: "spring", stiffness: 220, damping: 26 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
