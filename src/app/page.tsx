"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, FlaskConical, Radar, ShieldAlert, ShieldCheck, ShieldOff, Users } from "lucide-react";
import { Page, PageHeader } from "@/components/shell";
import { Empty, Rise, Stat, Verdict, ago } from "@/components/ui";
import { useStore, type SavedRun } from "@/lib/store";

const records = (r: SavedRun) => new Set(r.a?.exfiltrated.flatMap((x) => x.fields.map((f) => f.split(".")[0])) ?? []).size;

function Ring({ pct }: { pct: number | null }) {
  const r = 52, c = 2 * Math.PI * r;
  const p = pct ?? 0;
  return (
    <svg viewBox="0 0 128 128" className="size-[148px] -rotate-90" role="img" aria-label={pct === null ? "No data yet" : `${Math.round(p)}% of breaches stopped`}>
      <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="9" />
      <motion.circle
        cx="64" cy="64" r={r} fill="none" stroke="var(--mint)" strokeWidth="9" strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - p / 100) }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  );
}

export default function Overview() {
  const { runs, policy, status } = useStore();
  const breachedA = runs.filter((r) => r.a?.verdict === "compromised");
  const breachedB = runs.filter((r) => r.b?.verdict === "compromised");
  const stopped = breachedA.filter((r) => r.b?.verdict !== "compromised").length;
  const rate = breachedA.length ? (stopped / breachedA.length) * 100 : null;
  const blocked = runs.reduce((n, r) => n + (r.b?.blocked ?? 0), 0);
  const saved = breachedA.filter((r) => r.b?.verdict !== "compromised").reduce((n, r) => n + records(r), 0);

  const byTech = Object.values(
    runs.reduce<Record<string, { tech: string; n: number; a: number; b: number }>>((m, r) => {
      const k = r.attack.technique;
      m[k] ??= { tech: k, n: 0, a: 0, b: 0 };
      m[k].n++;
      if (r.a?.verdict === "compromised") m[k].a++;
      if (r.b?.verdict === "compromised") m[k].b++;
      return m;
    }, {}),
  ).sort((x, y) => y.a / y.n - x.a / x.n || y.n - x.n);

  const rulesOn = policy ? [policy.blockConfidentialEgress, policy.blockUnapprovedDestinations].filter(Boolean).length : 0;

  return (
    <Page>
      <PageHeader
        title="Overview"
        sub="Security posture of the Northwind support agent across every recorded attack."
        actions={
          <>
            <Link href="/attacks?scan=1" className="btn btn-glass h-9 px-4 text-[13px] gap-2"><Radar size={14} />Run full scan</Link>
            <Link href="/lab" className="btn btn-primary h-9 px-4 text-[13px] gap-2"><FlaskConical size={14} />New test</Link>
          </>
        }
      />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Stat i={0} icon={FlaskConical} label="Attacks run" value={runs.length} hint={`${new Set(runs.map((r) => r.attack.technique)).size} techniques`} />
        <Stat i={1} icon={ShieldOff} tone="red" label="Breaches without protection" value={breachedA.length} hint={runs.length ? `${Math.round((breachedA.length / runs.length) * 100)}% of attacks landed` : "—"} />
        <Stat i={2} icon={ShieldCheck} tone="mint" label="Actions blocked by OVRIDE" value={blocked} hint={`${breachedB.length} breach${breachedB.length === 1 ? "" : "es"} got through`} />
        <Stat i={3} icon={Users} tone="mint" label="Customer records kept safe" value={saved} hint="Would have leaked unprotected" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[340px_1fr]">
        <Rise i={4} className="card p-6 flex flex-col items-center text-center">
          <div className="self-start text-[13px] font-medium">Protection rate</div>
          <div className="relative mt-5 grid place-items-center">
            <Ring pct={rate} />
            <div className="absolute text-center">
              <div className="text-[30px] font-semibold tracking-[-0.03em]">{rate === null ? "—" : `${Math.round(rate)}%`}</div>
              <div className="text-[11px] text-fg-3">breaches stopped</div>
            </div>
          </div>
          <p className="mt-5 text-[12px] text-fg-3 leading-relaxed">
            {rate === null ? "Run an attack that compromises the unprotected agent to measure this." : `${stopped} of ${breachedA.length} successful attacks were stopped by the policy.`}
          </p>
          <div className="mt-4 w-full flex items-center justify-between border-t border-white/[0.06] pt-3 text-[12px]">
            <span className="text-fg-3">Policy</span>
            <Link href="/policy" className="text-fg-2 hover:text-fg">{rulesOn}/2 rules enforced →</Link>
          </div>
          <div className="mt-2 w-full flex items-center justify-between text-[12px]">
            <span className="text-fg-3">Mode</span>
            <Link href="/agent" className="text-fg-2 hover:text-fg">{status?.live ? "Live LLM" : "Sample Replay"} →</Link>
          </div>
        </Rise>

        <Rise i={5} className="card p-6">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-medium">Breach rate by technique</div>
            <div className="flex items-center gap-3 text-[11px] text-fg-3">
              <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-[color:var(--red)]" />Without protection</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-[color:var(--mint)]" />With OVRIDE</span>
            </div>
          </div>
          {byTech.length ? (
            <div className="mt-5 space-y-4">
              {byTech.slice(0, 7).map((t, i) => (
                <div key={t.tech}>
                  <div className="flex items-center justify-between text-[12.5px]">
                    <span className="text-fg-2 truncate">{t.tech}</span>
                    <span className="text-fg-3 mono text-[11px] shrink-0">{t.a}/{t.n} → {t.b}/{t.n}</span>
                  </div>
                  <div className="mt-1.5 space-y-[3px]">
                    {[["red", t.a, "without protection"], ["mint", t.b, "with OVRIDE"]].map(([tone, k, label]) => (
                      <div key={tone as string} className="h-[6px] rounded-full bg-white/[0.05] overflow-hidden" title={`${t.tech}: ${k}/${t.n} breached ${label}`}>
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: `var(--${tone})` }}
                          initial={{ width: 0 }}
                          animate={{ width: `${((k as number) / t.n) * 100}%` }}
                          transition={{ delay: 0.15 + i * 0.05, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-6 text-[12.5px] text-fg-3">No data yet. Each technique appears here after its first run.</p>
          )}
        </Rise>
      </div>

      <Rise i={6} className="mt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] font-medium">Recent runs</div>
          {runs.length > 0 && <Link href="/runs" className="text-[12px] text-fg-3 hover:text-fg inline-flex items-center gap-1">All runs <ArrowRight size={12} /></Link>}
        </div>
        {runs.length ? (
          <div className="card divide-y divide-white/[0.05] overflow-hidden">
            {runs.slice(0, 6).map((r) => (
              <Link key={r.id} href={`/lab?run=${r.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.03] transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] truncate">{r.attack.title}</div>
                  <div className="text-[11.5px] text-fg-3 truncate">{r.attack.technique} · {r.mode === "live" ? r.model.split("/")[1] ?? r.model : "Sample Replay"}</div>
                </div>
                <div className="hidden sm:flex items-center gap-2 shrink-0">
                  <Verdict o={r.a} />
                  <ArrowRight size={12} className="text-fg-3" />
                  <Verdict o={r.b} />
                </div>
                <span className="text-[11px] text-fg-3 w-16 text-right shrink-0">{ago(r.at)}</span>
              </Link>
            ))}
          </div>
        ) : (
          <Empty icon={ShieldAlert} title="No attacks recorded yet" sub="Generate an attack or run a full scan. Every run is saved here for replay." action={{ href: "/lab", label: "Open the Attack Lab" }} />
        )}
      </Rise>
    </Page>
  );
}
