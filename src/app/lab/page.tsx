"use client";
// Attack lab: one screen, both realities, a real run. Every row is a recorded event.
import { Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import {
  Bot, ChevronRight, FileText, History, Library, Loader, Mail, MessageSquare,
  Play, RotateCcw, Crosshair, Send, ShieldAlert, ShieldCheck, TriangleAlert, Wrench, X,
} from "lucide-react";
import { Nav } from "@/components/nav";
import { Timeline } from "@/components/timeline";
import { Glass, GlassButton } from "@/components/glass";
import { PolicyEditor } from "@/components/policy-editor";
import { useRun } from "@/lib/use-run";
import { useStore } from "@/lib/store";
import { ago } from "@/components/ui";
import { explain, fmtT, laneView, steps, divergence, verdictLabel, type LaneView, type Stage, type Step } from "@/lib/trace";

type LibAttack = { title: string; technique: string; body: string; source: "llm" | "library" };
type ModelOpt = { id: string; label: string; price: string };

const STAGES: { id: Stage; icon: typeof Mail; label: string; sub: string }[] = [
  { id: "input", icon: Mail, label: "External Input", sub: "attacker email" },
  { id: "agent", icon: Bot, label: "AI Agent", sub: "summarize request" },
  { id: "tool", icon: Wrench, label: "Tool Action", sub: "live tool calls" },
  { id: "outcome", icon: Send, label: "Outcome", sub: "policy gate" },
];

const WAITING = [
  ["Read email", "The inbound message has not been opened.", Mail],
  ["Agent reasoning", "Waiting for the model.", MessageSquare],
  ["Tool call", "No tool has been called yet.", Wrench],
  ["Outcome", "Run an attack to see the verdict.", ShieldCheck],
] as const;

function stageLook(id: Stage, a: LaneView, b: LaneView) {
  if (id === "outcome" && a.outcome?.verdict === "compromised") return "bad";
  if (id === "outcome" && (b.outcome?.verdict === "defended" || b.outcome?.verdict === "resisted")) return "good";
  if (id === "tool" && b.sends.some((s) => s.blocked)) return "good";
  if (id === "input" && a.email?.untrusted) return "bad";
  if (a.active === id || b.active === id) return "hot";
  return "idle";
}

const ring = {
  idle: "shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)] text-fg-3",
  hot: "shadow-[inset_0_0_0_1px_rgba(230,241,255,.55),0_0_32px_-6px_rgba(230,241,255,.55)] text-fg bg-white/[0.07]",
  bad: "shadow-[inset_0_0_0_1px_rgba(239,122,104,.7),0_0_36px_-6px_rgba(239,122,104,.7)] text-[color:var(--red)] bg-[color:var(--red)]/10",
  good: "shadow-[inset_0_0_0_1px_rgba(127,224,191,.7),0_0_36px_-6px_rgba(127,224,191,.7)] text-[color:var(--mint)] bg-[color:var(--mint)]/10",
} as const;
const wireTone = { idle: undefined, hot: "var(--ice)", bad: "var(--red)", good: "var(--mint)" } as const;

function Metric(props: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-2xl bg-white/[0.03] px-3.5 py-2.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]">
      {props.tone && <span aria-hidden className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${props.tone}, transparent)` }} />}
      <div className="truncate text-[10px] uppercase tracking-[0.14em] text-fg-3">{props.label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-[22px] font-semibold leading-none tracking-[-0.03em] tabular-nums" style={{ color: props.tone }}>{props.value}</span>
        <span className="truncate text-[11px] text-fg-3">{props.sub}</span>
      </div>
    </div>
  );
}

const verdictDot = (v?: string) => (v === "compromised" ? "var(--red)" : v === "defended" || v === "resisted" ? "var(--mint)" : "rgba(255,255,255,.25)");

function rowOf(s: Step): { title: string; detail: string } {
  const e = s.ev;
  if (e.kind === "model") return { title: "Agent reasoning", detail: e.text };
  if (e.kind === "error") return { title: "Error", detail: e.message };
  if (e.kind === "run_end") return { title: "Outcome", detail: e.outcome.summary };
  if (e.kind !== "tool_call") return { title: s.label, detail: "" };
  if (e.tool === "read_email") return { title: "Read email", detail: s.result?.status === "executed" ? "Opened the inbound message. Its text is now in context." : s.label };
  if (e.tool === "search_customers") return { title: "Tool call", detail: `Searched customers “${e.args.query ?? ""}”.` };
  if (e.tool === "send_message") {
    const blocked = s.result?.status === "blocked";
    return { title: "Tool call", detail: blocked ? `Send to ${e.args.to} was blocked.` : `Sent “${e.args.subject}” to ${e.args.to}.` };
  }
  return { title: "Tool call", detail: s.label };
}

function RowIcon({ step }: { step?: Step }) {
  const kind = step?.ev.kind;
  const tool = step?.ev.kind === "tool_call" ? step.ev.tool : "";
  const Icon = kind === "model" ? MessageSquare : kind === "run_end" ? ShieldCheck : tool === "read_email" ? Mail : tool === "send_message" ? Send : Wrench;
  return <Icon size={13} />;
}

function ModelMenu(props: {
  kicker: string;
  value: string;
  models: ModelOpt[];
  open: boolean;
  disabled?: boolean;
  fallback: string;
  onOpen: () => void;
  onPick: (id: string) => void;
}) {
  const current = props.models.find((m) => m.id === props.value);
  const mark = (current?.label ?? props.fallback).slice(0, 1).toUpperCase();
  return (
    <div className="relative">
      <button
        type="button"
        disabled={props.disabled}
        onClick={props.onOpen}
        className="flex w-full items-center gap-2.5 rounded-xl bg-white/[0.04] px-2.5 py-2 text-left shadow-[inset_0_0_0_1px_rgba(255,255,255,.07)] disabled:opacity-60"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-[11px] font-semibold text-fg-2">{mark}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[10px] text-fg-3">{props.kicker}</span>
          <span className="block truncate text-[12.5px]">{props.disabled ? props.fallback : current?.label ?? props.fallback}</span>
        </span>
        <ChevronRight size={14} className="shrink-0 text-fg-3" />
      </button>
      {props.open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 max-h-52 overflow-auto scroll-thin rounded-xl bg-[#14161a] p-1 shadow-[0_16px_40px_-12px_rgba(0,0,0,.8),inset_0_0_0_1px_rgba(255,255,255,.08)]">
          {props.models.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => props.onPick(m.id)}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-white/[0.06] ${m.id === props.value ? "text-fg" : "text-fg-2"}`}
            >
              <span className="truncate text-[12.5px]">{m.label}</span>
              <span className="shrink-0 text-[10px] mono text-fg-3">{m.price}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Story(props: { branch: "A" | "B"; view: LaneView; list: Step[]; running: boolean; selected: string | null; onPick: (s: Step) => void }) {
  const A = props.branch === "A";
  const tone = A ? "var(--red)" : "var(--mint)";
  const v = props.view;
  const blurb = v.outcome?.summary
    ?? v.error
    ?? (props.running || v.started
      ? A ? "Following the email. Nothing is blocked in this reality." : "Checking each tool call before it runs."
      : A ? "No policy on this side. The agent can do what the email asks." : "Same attack. The policy runs before every tool call.");
  return (
    <div
      className="relative flex min-h-[300px] min-w-0 flex-col overflow-hidden rounded-[20px] p-4 xl:min-h-0"
      style={{
        background: `radial-gradient(120% 60% at 50% -10%, color-mix(in srgb, ${tone} 14%, transparent), transparent 60%), rgba(0,0,0,.2)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tone} 26%, transparent)`,
      }}
    >
      <span aria-hidden className="pointer-events-none absolute inset-x-10 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${tone}, transparent)` }} />
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl" style={{ color: tone, background: `color-mix(in srgb, ${tone} 12%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tone} 30%, transparent)` }}>
          {A ? <ShieldAlert size={15} /> : <ShieldCheck size={15} />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-semibold tracking-[-0.01em]" style={{ color: tone }}>{A ? "Without Protection" : "OVRIDE Protected"}</span>
          <span className="block truncate text-[10px] uppercase tracking-[0.14em] text-fg-3">{A ? "Reality A · no policy" : "Reality B · policy enforced"}</span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {v.started && <span className="hidden text-[10.5px] mono text-fg-3 2xl:inline">{v.step} steps</span>}
          {v.outcome
            ? <span className={`chip ${v.outcome.verdict === "compromised" ? "chip-red" : v.outcome.verdict === "incomplete" ? "" : "chip-mint"}`}>{verdictLabel(v.outcome.verdict)}</span>
            : props.running && <Loader size={13} className="animate-spin text-fg-3" />}
        </span>
      </div>
      <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-relaxed text-fg-2/80">{blurb}</p>
      <ol className="relative mt-2.5 min-h-0 flex-1 space-y-0.5 overflow-auto scroll-thin pr-1">
        <span aria-hidden className="pointer-events-none absolute bottom-4 left-[33px] top-4 w-px bg-gradient-to-b from-white/10 via-white/[0.06] to-transparent" />
        {props.list.length === 0 && WAITING.map(([title, detail, Icon], i) => (
          <li key={title} className="flex gap-2.5 rounded-lg px-1.5 py-1.5 opacity-55">
            <span className="mt-0.5 w-4 shrink-0 text-center text-[11px] mono text-fg-3">{i + 1}</span>
            <span className="relative grid size-6 shrink-0 place-items-center rounded-md bg-[#15171b] text-fg-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]"><Icon size={12} /></span>
            <span className="min-w-0">
              <span className="block text-[12.5px] text-fg-2">{title}</span>
              <span className="block truncate text-[11.5px] text-fg-3">{detail}</span>
            </span>
          </li>
        ))}
        {props.list.map((s, i) => {
          const row = rowOf(s);
          const on = props.selected === s.key;
          const color = s.tone === "danger" ? "var(--red)" : s.tone === "safe" ? "var(--mint)" : undefined;
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => props.onPick(s)}
                className={`flex w-full gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-white/[0.04] ${on ? "bg-white/[0.07] shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]" : ""}`}
              >
                <span className="mt-0.5 w-4 shrink-0 text-center text-[11px] mono text-fg-3">{i + 1}</span>
                <span
                  className="relative grid size-6 shrink-0 place-items-center rounded-md bg-[#15171b] text-fg-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]"
                  style={color ? { color, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 45%, transparent), 0 0 14px -4px ${color}` } : undefined}
                >
                  <RowIcon step={s} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="text-[12.5px]" style={{ color: color ?? "var(--fg-2)" }}>{row.title}</span>
                    <span className="ml-auto shrink-0 text-[10px] mono text-fg-3">{fmtT(s.t)}</span>
                  </span>
                  <span className="block truncate text-[11.5px] text-fg-3">{row.detail}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function headline(step: Step) {
  const e = step.ev;
  if (e.kind === "run_end") return ({ compromised: "Customer data was exfiltrated", defended: "OVRIDE blocked the exfiltration", resisted: "The agent ignored the attack", incomplete: "The run did not finish" })[e.outcome.verdict];
  if (e.kind === "tool_call" && e.tool === "send_message" && step.result?.status === "blocked") return "External data exfiltration blocked";
  if (e.kind === "tool_call" && e.tool === "read_email") return "Malicious email read";
  if (e.kind === "tool_call" && e.tool === "search_customers") return "Customer database queried";
  if (e.kind === "model") return "Hidden instruction in the reasoning";
  return step.label;
}

function badge(step: Step) {
  const e = step.ev;
  if (e.kind === "tool_call" && step.result?.status === "blocked") return { text: "Blocked by Policy", tone: "red" as const };
  if (e.kind === "run_end" && e.outcome.verdict === "compromised") return { text: "Data exfiltrated", tone: "red" as const };
  if (e.kind === "run_end") return { text: verdictLabel(e.outcome.verdict), tone: e.outcome.verdict === "incomplete" ? "neutral" as const : "mint" as const };
  if (step.tone === "danger") return { text: "Unsafe action", tone: "red" as const };
  return { text: step.branch === "B" ? "Protected reality" : "Unprotected reality", tone: "neutral" as const };
}

function Lab() {
  const run = useRun();
  const { runs } = useStore();
  const params = useSearchParams();
  const [draft, setDraft] = useState("");
  const [library, setLibrary] = useState<LibAttack[]>([]);
  const [attacker, setAttacker] = useState("");
  const [pop, setPop] = useState<"target" | "attacker" | "lib" | null>(null);
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<"demo" | "live">("live");
  const closed = useRef(false);

  const runId = params.get("run");
  useEffect(() => {
    if (!runId) return;
    const saved = runs.find((r) => r.id === runId);
    if (saved) run.load(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, runs.length]);

  useEffect(() => {
    if (run.attack) setDraft(run.attack.body);
  }, [run.attack]);

  useEffect(() => {
    fetch("/api/attack")
      .then((r) => r.json())
      .then((j) => setLibrary(j.library ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!attacker && run.status?.models?.length) {
      const list = run.status.models;
      setAttacker((list.find((m) => !m.id.startsWith("anthropic/")) ?? list[0]).id); // Claude models decline to write attacks
    }
  }, [attacker, run.status]);

  useEffect(() => {
    if (run.phase === "running") closed.current = false;
  }, [run.phase]);

  useEffect(() => {
    if (!run.playing || closed.current) return;
    const last = [...steps(run.events, "A"), ...steps(run.events, "B")]
      .filter((s) => s.t <= run.cursor + 1)
      .sort((a, b) => a.t - b.t)
      .at(-1);
    if (last && last.key !== run.selected?.key) run.setSelected(last);
  }, [run.playing, run.cursor, run.events, run.selected?.key, run.setSelected]);

  const started = run.phase === "running" || run.phase === "done";
  const busy = run.genBusy || run.phase === "running";
  const vA = useMemo(() => laneView(run.events, "A", run.cursor), [run.events, run.cursor]);
  const vB = useMemo(() => laneView(run.events, "B", run.cursor), [run.events, run.cursor]);
  const listA = useMemo(() => steps(run.events, "A").filter((s) => s.t <= run.cursor + 1), [run.events, run.cursor]);
  const listB = useMemo(() => steps(run.events, "B").filter((s) => s.t <= run.cursor + 1), [run.events, run.cursor]);
  const div = useMemo(() => divergence(run.events), [run.events]);
  const models = run.status?.models ?? [];
  const live = !!run.status?.live;
  const step = run.selected;
  const x = step ? explain(step, run.events) : null;
  const pill = step ? badge(step) : null;
  // Nothing chosen yet: show the start screen instead of two empty columns.
  const fresh = !run.attack && !run.events.length && !busy;
  const demo = () => library.length && playLibrary(library[runs.length % library.length]);
  const leaked = vA.sends.filter((s) => !s.blocked && !s.approved).reduce((n, s) => n + s.records, 0);
  const blocked = vB.sends.filter((s) => s.blocked).length;
  const tokens = vA.tokens + vB.tokens;
  const breached = runs.filter((r) => r.a?.verdict === "compromised").length;

  const pick = (s: Step) => {
    closed.current = false;
    run.setCursor(s.t);
    run.setSelected(s);
  };

  const go = (body: string, m: "demo" | "live") => {
    setMode(m);
    return run.start(body, m);
  };

  const find = async () => {
    if (!run.policy || busy) return;
    setPop(null);
    const made = await run.generate(live ? attacker || undefined : undefined);
    if (made) await go(made.body, "live");
  };

  const playLibrary = (a: LibAttack, m: "demo" | "live" = "demo") => {
    if (!run.policy || busy) return;
    setPop(null);
    setDraft(a.body);
    run.open(a);
    void go(a.body, m);
  };
  const targetLabel = models.find((m) => m.id === run.model)?.label ?? "live model";

  return (
    <div className="min-h-screen px-3 pt-[74px] pb-3 xl:h-screen xl:overflow-hidden">
      <div className="aurora" aria-hidden />
      <Nav live={live} />

      <div className="grid h-full w-full gap-3 xl:grid-cols-[clamp(250px,16vw,310px)_minmax(0,1fr)_clamp(290px,20vw,380px)]">
        {/* ---------- Left rail: models, policy, tools, history ---------- */}
        <Glass radius={22} bezel={16} className={`p-3.5 xl:min-h-0 xl:overflow-auto scroll-thin ${pop === "target" || pop === "attacker" ? "z-20" : ""}`}>
          <div className="relative z-[2] flex min-h-full flex-col gap-3">
            <div className="rounded-xl bg-white/[0.03] px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]">
              <div className="flex items-center gap-2 text-[12.5px]">
                <span className={live ? "live-dot" : "size-[7px] rounded-full bg-fg-3"} />
                {live ? "OpenRouter connected" : "Sample Replay"}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-fg-3">
                {live ? "The target model runs both realities. Only the policy differs." : "No API key. The scripted agent still calls the real tools, and the policy still decides."}
              </p>
            </div>

            <div className="eyebrow -mb-1 mt-1 !text-[10px]">Models</div>
            <ModelMenu
              kicker="Target · the agent under attack"
              value={run.model}
              models={models}
              open={pop === "target"}
              disabled={!live || !models.length}
              fallback={live ? "Loading…" : "Scripted agent"}
              onOpen={() => setPop(pop === "target" ? null : "target")}
              onPick={(id) => { run.setModel(id); setPop(null); }}
            />
            <ModelMenu
              kicker="Attacker · used by real tests"
              value={attacker}
              models={models}
              open={pop === "attacker"}
              disabled={!live || !models.length}
              fallback={live ? "Loading…" : "Built-in library"}
              onOpen={() => setPop(pop === "attacker" ? null : "attacker")}
              onPick={(id) => { setAttacker(id); setPop(null); }}
            />
            {run.policy && (
              <div className="mt-1 border-t border-white/[0.06] pt-3">
                <div className="eyebrow mb-1 !text-[10px]">Policy under test</div>
                <p className="mb-2.5 text-[11px] leading-relaxed text-fg-3">Only the protected side enforces these. Flip one and run again.</p>
                <PolicyEditor policy={run.policy} onPolicy={run.setPolicy} />
              </div>
            )}

            <div className="border-t border-white/[0.06] pt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="eyebrow !text-[10px]">Recent runs</span>
                <span className="text-[10.5px] mono text-fg-3">{runs.length}</span>
              </div>
              {runs.length === 0 && <p className="px-1.5 text-[11.5px] text-fg-3">Runs you finish land here. Click one to replay it.</p>}
              <div className="grid gap-0.5">
                {runs.slice(0, 6).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    disabled={busy}
                    onClick={() => run.load(r)}
                    className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-white/[0.05] disabled:opacity-50"
                  >
                    <span className="flex shrink-0 gap-1" title="Unprotected · Protected">
                      <span className="size-1.5 rounded-full" style={{ background: verdictDot(r.a?.verdict) }} />
                      <span className="size-1.5 rounded-full" style={{ background: verdictDot(r.b?.verdict) }} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-fg-2">{r.attack.title}</span>
                    <span className="shrink-0 text-[10px] mono text-fg-3">{ago(r.at)}</span>
                  </button>
                ))}
              </div>
            </div>

            <p className="mt-auto flex items-center gap-1.5 pt-2 text-[10.5px] text-fg-3"><History size={11} />Fictional sandbox · no real accounts or data</p>
          </div>
        </Glass>

        {/* ---------- Centre: the agent, both realities, the clock ---------- */}
        <Glass radius={24} bezel={18} className="xl:min-h-0">
          <div className="relative z-[2] flex h-full flex-col gap-3.5 p-4 sm:p-5">
            <div className={`relative flex flex-wrap items-center justify-between gap-3 ${pop === "lib" ? "z-20" : ""}`}>
              <div className="flex min-w-0 items-center gap-3">
                <span className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-b from-white/[0.12] to-white/[0.03] shadow-[inset_0_0_0_1px_rgba(255,255,255,.1),inset_0_1px_0_rgba(255,255,255,.18),0_8px_24px_-10px_rgba(230,241,255,.35)]">
                  <Bot size={19} className="text-[color:var(--ice)]" />
                </span>
                <div className="min-w-0">
                  <div className="text-grad truncate text-[17px] font-semibold tracking-[-0.02em]">Northwind Customer-Support Agent</div>
                  <div className="truncate text-[12px] text-fg-3">Reads inbound email, posts a summary to #support-triage.</div>
                </div>
              </div>
              {!fresh && (
                <div className="flex flex-wrap items-center gap-2">
                  {run.attack && !busy && (
                    <GlassButton onClick={() => void go(draft, mode)} disabled={!draft.trim()}>
                      <RotateCcw size={14} />
                      Run again
                    </GlassButton>
                  )}
                  <GlassButton onClick={() => setPop(pop === "lib" ? null : "lib")} disabled={busy || !run.policy}>
                    <Library size={14} />
                    Demo attacks
                  </GlassButton>
                  <GlassButton variant="primary" onClick={() => void find()} disabled={busy || !run.policy}>
                    {busy ? <Loader size={14} className="animate-spin" /> : <Crosshair size={14} />}
                    {run.phase === "running" ? "Running…" : run.genBusy ? "Writing attack…" : "New real test"}
                  </GlassButton>
                </div>
              )}
              {pop === "lib" && !fresh && (
                <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-[min(420px,100%)] rounded-2xl bg-[#14161a] p-1.5 shadow-[0_18px_50px_-16px_rgba(0,0,0,.85),inset_0_0_0_1px_rgba(255,255,255,.08)]">
                  {library.map((a) => (
                    <button
                      key={a.technique}
                      type="button"
                      onClick={() => playLibrary(a)}
                      className="flex w-full flex-col rounded-xl px-3 py-2 text-left hover:bg-white/[0.05]"
                    >
                      <span className="text-[13px]">{a.title}</span>
                      <span className="text-[11px] text-fg-3">{a.technique}</span>
                    </button>
                  ))}
                  {!library.length && <p className="px-3 py-2 text-[12px] text-fg-3">Loading the library…</p>}
                </div>
              )}
            </div>

            <div className="flex items-center rounded-[20px] bg-black/15 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,.05)]">
              {STAGES.map((st, i) => {
                const look = stageLook(st.id, vA, vB);
                const next = i < STAGES.length - 1 ? stageLook(STAGES[i + 1].id, vA, vB) : "idle";
                const flowing = run.phase === "running" || next !== "idle";
                return (
                  <div key={st.id} className="flex min-w-0 flex-1 items-center last:flex-none">
                    <div className="flex flex-col items-center gap-1.5 px-1">
                      <span className={`relative grid size-12 place-items-center rounded-full bg-[#121418] transition-all duration-500 ${ring[look]}`}>
                        {look === "hot" && <span className="halo" aria-hidden />}
                        <st.icon size={18} strokeWidth={1.8} />
                        <span className="absolute -right-1 -top-1 grid size-[18px] place-items-center rounded-full bg-[#1a1c21] text-[9.5px] mono text-fg-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,.1)]">{i + 1}</span>
                      </span>
                      <div className="text-center">
                        <div className={`text-[11px] font-medium ${look === "idle" ? "text-fg-2" : "text-fg"}`}>{st.label}</div>
                        <div className="hidden text-[10px] text-fg-3 sm:block">{st.sub}</div>
                      </div>
                    </div>
                    {i < STAGES.length - 1 && (
                      <span
                        className={`wire mx-1 mb-8 flex-1 ${flowing ? "wire-on" : ""}`}
                        style={wireTone[next] ? ({ "--wire": wireTone[next] } as CSSProperties) : undefined}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {!fresh && <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              <Metric label="Records leaked" value={String(leaked)} sub="without protection" tone={leaked ? "var(--red)" : undefined} />
              <Metric label="Calls blocked" value={String(blocked)} sub="by OVRIDE" tone={blocked ? "var(--mint)" : undefined} />
              <Metric label="Tokens" value={tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens)} sub={`$${(vA.cost + vB.cost).toFixed(4)}`} />
              <Metric label="Breach rate" value={runs.length ? `${Math.round((breached / runs.length) * 100)}%` : "—"} sub={`${runs.length} runs unprotected`} />
            </div>}

            {vA.outcome?.verdict === "resisted" && vB.outcome && (
              <div className="flex items-start gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-[12px] leading-relaxed text-fg-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
                <ShieldCheck size={13} className="mt-0.5 shrink-0 text-[color:var(--mint)]" />
                <span>
                  {mode === "live" && live ? targetLabel : "The agent"} ignored this attack even without protection, so OVRIDE had nothing to block.
                  Try <b className="font-medium text-fg">New real test</b> for a different attack, pick another target model on the left, or watch the demo to see a block.
                </span>
              </div>
            )}

            {run.note && (
              <div className="flex items-start gap-2 rounded-xl bg-amber-300/[0.07] px-3 py-2 text-[12px] leading-relaxed text-amber-200/90 shadow-[inset_0_0_0_1px_rgba(252,211,77,.2)]">
                <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                {run.note}
              </div>
            )}

            {run.attack && (
              <div className="rounded-xl bg-black/20 px-3 py-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`chip shrink-0 ${mode === "live" && live ? "chip-mint" : ""}`}>
                    {mode === "live" && live ? <><span className="live-dot" />Real · {targetLabel}</> : "Demo · scripted agent"}
                  </span>
                  <span className="chip chip-red shrink-0">{run.attack.technique}</span>
                  <span className="shrink-0 text-[12.5px]">{run.attack.title}</span>
                  {!editing && <span className="hidden min-w-0 flex-1 truncate text-[12px] text-fg-3 md:block">{draft}</span>}
                  {mode === "demo" && live && !busy && (
                    <button type="button" onClick={() => void go(draft, "live")} className="ml-auto shrink-0 rounded-full bg-white/[0.07] px-2.5 py-1 text-[11.5px] text-fg hover:bg-white/[0.12]">
                      Try this on {targetLabel} →
                    </button>
                  )}
                  <button type="button" onClick={() => setEditing((v) => !v)} className={`${mode === "demo" && live && !busy ? "" : "ml-auto "}shrink-0 text-[11.5px] text-fg-3 hover:text-fg`}>
                    {editing ? "Hide payload" : "Edit payload"}
                  </button>
                </div>
                {editing && (
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    spellCheck={false}
                    rows={4}
                    className="mt-2 w-full resize-y rounded-xl bg-black/30 p-3 text-[12.5px] leading-relaxed text-fg shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)] outline-none"
                  />
                )}
              </div>
            )}

            {fresh ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 py-6 text-center">
                <div>
                  <div className="eyebrow">Start here</div>
                  <h2 className="text-grad mt-2 text-[26px] font-semibold tracking-[-0.03em]">Can an email trick this agent into leaking data?</h2>
                  <p className="mx-auto mt-2 max-w-[560px] text-[13px] leading-relaxed text-fg-3">
                    We send one malicious email to two copies of the same agent. One runs unprotected, the other behind OVRIDE. Pick how you want to try it.
                  </p>
                </div>
                <div className="grid w-full max-w-[760px] gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={demo}
                    disabled={!run.policy || !library.length}
                    className="group relative flex flex-col rounded-[22px] bg-white/[0.035] p-5 text-left shadow-[inset_0_0_0_1px_rgba(255,255,255,.09)] transition hover:bg-white/[0.06] disabled:opacity-50"
                  >
                    <span className="grid size-10 place-items-center rounded-xl bg-white/[0.07] text-fg"><Play size={17} /></span>
                    <span className="mt-4 text-[16px] font-semibold tracking-[-0.01em]">Watch a demo</span>
                    <span className="mt-1 text-[12.5px] leading-relaxed text-fg-3">A scripted agent that obeys the email, so you always see the leak and the block. Real tools and policy, no LLM, a few seconds.</span>
                    <span className="mt-4 inline-flex items-center gap-1 text-[12.5px] text-fg-2 group-hover:text-fg">Run demo <ChevronRight size={14} /></span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void find()}
                    disabled={!run.policy}
                    className="group relative flex flex-col rounded-[22px] p-5 text-left transition hover:brightness-110 disabled:opacity-50"
                    style={{ background: "radial-gradient(120% 90% at 0% 0%, rgba(230,241,255,.14), rgba(230,241,255,.03) 60%)", boxShadow: "inset 0 0 0 1px rgba(230,241,255,.28), 0 18px 40px -20px rgba(230,241,255,.35)" }}
                  >
                    <span className="grid size-10 place-items-center rounded-xl bg-[#eef3f8] text-[#0a0b0d]"><Crosshair size={17} /></span>
                    <span className="mt-4 text-[16px] font-semibold tracking-[-0.01em]">Test for real</span>
                    <span className="mt-1 text-[12.5px] leading-relaxed text-fg-3">
                      {live
                        ? `The attacker model writes a new attack and ${targetLabel} runs it live. Strong models often refuse, which is a real result too.`
                        : "Needs OPENROUTER_API_KEY. Without it this falls back to a library attack."}
                    </span>
                    <span className="mt-4 inline-flex items-center gap-1 text-[12.5px] text-fg group-hover:translate-x-0.5 transition-transform">Find vulnerabilities <ChevronRight size={14} /></span>
                  </button>
                </div>
                <ol className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] text-fg-3">
                  {["Pick demo or real", "Watch both agents side by side", "Click any step to see why"].map((t, i) => (
                    <li key={t} className="flex items-center gap-2">
                      <span className="grid size-5 place-items-center rounded-full bg-white/[0.06] text-[10.5px] mono text-fg-2">{i + 1}</span>
                      {t}
                    </li>
                  ))}
                </ol>
                <button type="button" onClick={() => setPop(pop === "lib" ? null : "lib")} className="text-[12px] text-fg-3 underline decoration-white/20 underline-offset-4 hover:text-fg-2">
                  or choose a specific demo attack
                </button>
                {pop === "lib" && (
                  <div className="grid w-full max-w-[760px] gap-1.5 sm:grid-cols-2">
                    {library.map((a) => (
                      <button key={a.technique} type="button" onClick={() => playLibrary(a)}
                        className="rounded-xl bg-white/[0.03] px-3 py-2 text-left shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)] hover:bg-white/[0.06]">
                        <span className="block truncate text-[12.5px]">{a.title}</span>
                        <span className="block truncate text-[11px] text-fg-3">{a.technique}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
            <div className="grid min-h-0 flex-1 items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_64px_minmax(0,1fr)]">
              <Story branch="A" view={vA} list={listA} running={run.phase === "running"} selected={step?.key ?? null} onPick={pick} />
              <div className="relative hidden flex-col items-center justify-center lg:flex">
                <span aria-hidden className="absolute inset-y-6 left-1/2 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent" />
                <span className="relative grid size-10 place-items-center rounded-full bg-[#121418] text-[10px] font-semibold tracking-[0.12em] text-fg-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,.12),0_0_24px_-6px_rgba(230,241,255,.3)]">VS</span>
                <span className="relative mt-2.5 max-w-[64px] rounded bg-[#0f1013] px-1 py-0.5 text-center text-[10px] leading-tight text-fg-3">{div ? div.title : "Same task, different outcome"}</span>
              </div>
              <Story branch="B" view={vB} list={listB} running={run.phase === "running"} selected={step?.key ?? null} onPick={pick} />
            </div>
            )}

            {!fresh && <div>
              <div className="mb-2 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium">Execution timeline</div>
                  <div className="truncate text-[11.5px] text-fg-3">Scrub the attack. Both realities stay on the same clock.</div>
                </div>
                <div className="shrink-0 text-[11px] mono text-fg-3">{run.events.length} events · {fmtT(started ? run.duration : 0)}</div>
              </div>
              {started ? (
                <Timeline
                  inline
                  events={run.events}
                  cursor={run.cursor}
                  duration={run.duration}
                  playing={run.playing}
                  running={run.phase === "running"}
                  divergence={div}
                  onTogglePlay={run.togglePlay}
                  onRewind={run.rewind}
                  onScrub={run.setCursor}
                  onSelect={pick}
                />
              ) : (
                <div className="relative overflow-hidden rounded-[26px] bg-white/[0.025] px-5 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,.05)]">
                  <div aria-hidden className="space-y-3">
                    {["var(--red)", "var(--mint)"].map((c) => (
                      <div key={c} className="relative h-px bg-white/[0.07]">
                        {[8, 26, 47, 71, 88].map((p) => (
                          <span key={p} className="absolute top-1/2 size-[5px] -translate-y-1/2 rounded-full opacity-30" style={{ left: `${p}%`, background: c }} />
                        ))}
                      </div>
                    ))}
                  </div>
                  <p className="mt-2.5 truncate text-[12px] text-fg-3">
                    Writing the attack… both agents start in a moment.
                  </p>
                </div>
              )}
            </div>}
          </div>
        </Glass>

        {/* ---------- Right rail: the selected event, read in plain language ---------- */}
        <Glass radius={22} bezel={16} className="xl:min-h-0 xl:overflow-auto scroll-thin">
          <div className="relative z-[2] flex min-h-full flex-col p-4">
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-medium">Event Details</div>
              {step && (
                <button type="button" aria-label="Close details" onClick={() => { closed.current = true; run.setSelected(null); }} className="text-fg-3 hover:text-fg">
                  <X size={15} />
                </button>
              )}
            </div>

            {!step || !x || !pill ? (
              <div className="grid flex-1 place-items-center px-2 py-10 text-center">
                <div>
                  <span className="relative mx-auto grid size-16 place-items-center rounded-full bg-gradient-to-b from-white/[0.08] to-white/[0.02] text-fg-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,.1)]">
                    <span aria-hidden className="absolute -inset-3 rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,.05)]" />
                    <span aria-hidden className="absolute -inset-6 rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,.03)]" />
                    <ShieldAlert size={22} />
                  </span>
                  <p className="mt-8 text-[14px] font-medium">Nothing selected</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-fg-3">Run an attack, then click any step. This panel only reads what was recorded.</p>
                  <div className="mx-auto mt-6 w-fit space-y-2 text-left text-[11.5px] text-fg-3">
                    {([
                      ["var(--red)", "Unsafe action executed"],
                      ["var(--mint)", "Blocked by policy"],
                      ["rgba(255,255,255,.7)", "Neutral step"],
                    ] as const).map(([c, label]) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className="size-1.5 rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
                        {label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <span className={`chip ${pill.tone === "red" ? "chip-red" : pill.tone === "mint" ? "chip-mint" : ""}`}>
                  <ShieldCheck size={12} />
                  {pill.text}
                </span>
                <h2 className="text-grad mt-3 text-[19px] font-semibold leading-snug tracking-[-0.02em]">{headline(step)}</h2>
                <div className="mt-1 text-[11px] mono text-fg-3">{fmtT(step.t)} · {step.branch === "A" ? "without protection" : "protected"}</div>

                <dl className="mt-4 space-y-2.5">
                  {([
                    ["What happened?", x.what, FileText],
                    ["Why is it risky?", x.why, TriangleAlert],
                    ["What did OVRIDE do?", x.did, ShieldCheck],
                  ] as const).map(([label, body, Icon]) => (
                    <div key={label} className="rounded-xl bg-white/[0.03] px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.05)]">
                      <dt className="flex items-center gap-1.5 text-[12px] text-fg-2"><Icon size={13} className="text-fg-3" />{label}</dt>
                      <dd className="mt-1 text-[12.5px] leading-relaxed text-fg-3">{body}</dd>
                    </div>
                  ))}
                </dl>
                {x.other && <p className="mt-4 border-t border-white/[0.06] pt-3 text-[12px] leading-relaxed text-fg-3">{x.other}</p>}
              </div>
            )}

            <p className="mt-auto pt-4 text-[11.5px] leading-relaxed text-fg-3">
              Policy switches sit on the left. Change one and press Run again — only the protected reality enforces them.
            </p>
          </div>
        </Glass>
      </div>
    </div>
  );
}

export default function LabPage() {
  return (
    <Suspense fallback={null}>
      <Lab />
    </Suspense>
  );
}
