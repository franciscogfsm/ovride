"use client";
// Platform chrome: a quiet sidebar on desktop, a top bar with scrollable tabs on mobile.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, FlaskConical, History, LayoutGrid, ShieldCheck, Swords } from "lucide-react";
import type { ReactNode } from "react";
import { useStore } from "@/lib/store";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/lab", label: "Attack Lab", icon: FlaskConical },
  { href: "/runs", label: "Runs", icon: History },
  { href: "/attacks", label: "Attacks", icon: Swords },
  { href: "/policy", label: "Policy", icon: ShieldCheck },
  { href: "/agent", label: "Agent", icon: Bot },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="grid size-[26px] place-items-center rounded-lg bg-white/[0.07] shadow-[inset_0_0_0_1px_rgba(255,255,255,.09)]">
        <ShieldCheck size={14} strokeWidth={2.2} className="text-[color:var(--ice)]" />
      </span>
      <span className="text-[13px] font-semibold tracking-[0.22em]">OVRIDE</span>
    </Link>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { status, model, runs } = useStore();
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="min-h-screen">
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[var(--side)] flex-col border-r border-white/[0.06] bg-[color:var(--bg)]/80 backdrop-blur-xl z-40 px-3 py-5">
        <div className="px-2"><Logo /></div>
        <div className="mt-6 px-2 text-[11px] text-fg-3">Workspace</div>
        <div className="mt-1 px-2 text-[13px] text-fg-2 truncate">Northwind Support Agent</div>
        <nav className="mt-6 flex flex-col gap-0.5">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={`flex items-center gap-2.5 h-9 px-2.5 rounded-lg text-[13px] transition-colors ${
                isActive(href) ? "bg-white/[0.07] text-fg" : "text-fg-2 hover:text-fg hover:bg-white/[0.04]"
              }`}
            >
              <Icon size={15} className={isActive(href) ? "text-[color:var(--ice)]" : "text-fg-3"} />
              {label}
              {href === "/runs" && runs.length > 0 && <span className="ml-auto text-[11px] mono text-fg-3">{runs.length}</span>}
            </Link>
          ))}
        </nav>
        <div className="mt-auto rounded-xl p-3 bg-white/[0.03] shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]">
          <div className="flex items-center gap-2 text-[12px]">
            <span className={status?.live ? "live-dot" : "size-[7px] rounded-full bg-fg-3"} />
            <span className="text-fg-2">{status ? (status.live ? "Live LLM" : "Sample Replay") : "Connecting…"}</span>
          </div>
          <div className="mt-1 text-[11px] mono text-fg-3 truncate">{status?.live ? model : "no OPENROUTER_API_KEY"}</div>
        </div>
      </aside>

      <header className="lg:hidden sticky top-0 z-40 border-b border-white/[0.06] bg-[color:var(--bg)]/85 backdrop-blur-xl">
        <div className="h-12 px-4 flex items-center justify-between">
          <Logo />
          <span className="chip">
            <span className={status?.live ? "live-dot" : "size-[7px] rounded-full bg-fg-3"} />
            {status?.live ? "Live" : "Replay"}
          </span>
        </div>
        <nav className="flex gap-1 overflow-x-auto scroll-thin px-3 pb-2">
          {NAV.map(({ href, label }) => (
            <Link key={href} href={href} className={`shrink-0 h-8 px-3 grid place-items-center rounded-full text-[12.5px] ${isActive(href) ? "bg-white/[0.08] text-fg" : "text-fg-2"}`}>
              {label}
            </Link>
          ))}
        </nav>
      </header>

      <div className="lg:pl-[var(--side)]">{children}</div>
    </div>
  );
}

export function PageHeader(props: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{props.title}</h1>
        {props.sub && <p className="mt-1 text-[13px] text-fg-3 max-w-[620px] leading-relaxed">{props.sub}</p>}
      </div>
      {props.actions && <div className="flex items-center gap-2 flex-wrap">{props.actions}</div>}
    </div>
  );
}

/** Standard page body width and padding. */
export function Page({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <main className={`px-4 sm:px-8 py-8 max-w-[1200px] mx-auto ${className}`}>{children}</main>;
}
