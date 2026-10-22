"use client";
// Attack lab: one screen, both realities, a real run. Every row is a recorded event.
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Bot, ChevronRight, FileText, Library, Loader, Mail, MessageSquare,
  Play, Search, Send, ShieldAlert, ShieldCheck, Sparkles, TriangleAlert, Wrench, X,
} from "lucide-react";
import { Nav } from "@/components/nav";
import { Timeline } from "@/components/timeline";
import { Glass, GlassButton } from "@/components/glass";
import { PolicyEditor } from "@/components/policy-editor";
import { useRun } from "@/lib/use-run";
import { useStore } from "@/lib/store";
import { explain, fmtT, laneView, steps, divergence, type LaneView, type Stage, type Step } from "@/lib/trace";

type LibAttack = { title: string; technique: string; body: string; source: "llm" | "library" };
type ModelOpt = { id: string; label: string; price: string };

const STAGES: { id: Stage; icon: typeof Mail; label: string; sub: string }[] = [
  { id: "input", icon: Mail, label: "External Input", sub: "attacker email" },
  { id: "agent", icon: Bot, label: "AI Agent", sub: "summarize request" },
  { id: "tool", icon: Wrench, label: "Tool Action", sub: "live tool calls" },
  { id: "outcome", icon: Send, label: "Outcome", sub: "policy gate" },
];

const WAITING = [
  ["Read email", "The inbound message has not been opened."],
  ["Agent reasoning", "Waiting for the model."],
  ["Tool call", "No tool has been called yet."],
  ["Outcome", "Run an attack to see the verdict."],
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
  hot: "shadow-[inset_0_0_0_1px_rgba(230,241,255,.55),0_0_22px_-8px_rgba(230,241,255,.9)] text-fg",
  bad: "shadow-[inset_0_0_0_1px_rgba(239,122,104,.7),0_0_22px_-8px_rgba(239,122,104,.85)] text-[color:var(--red)]",
  good: "shadow-[inset_0_0_0_1px_rgba(127,224,191,.7),0_0_22px_-8px_rgba(127,224,191,.85)] text-[color:var(--mint)]",
} as const;

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
          <span className="block text-[10px] text-fg-3">{props.kicker}</span>
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
  const blurb = props.view.outcome?.summary
    ?? props.view.error
    ?? (props.running || props.view.started
      ? A ? "Following the email. Nothing is blocked in this reality." : "Checking each tool call before it runs."
      : A ? "No policy on this side. The agent can do what the email asks." : "Same attack. The policy runs before every tool call.");
  return (
    <div
      className="min-w-0 rounded-[18px] p-3.5 sm:p-4"
      style={{ background: A ? "rgba(239,122,104,.045)" : "rgba(127,224,191,.045)", boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tone} 32%, transparent)` }}
    >
      <div className="flex items-center gap-2">
        <span className="size-1.5 rounded-full" style={{ background: tone, boxShadow: `0 0 8px ${tone}` }} />
        <span className="text-[13px] font-medium" style={{ color: tone }}>{A ? "Without Protection" : "OVRIDE Protected"}</span>
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-fg-3">{blurb}</p>
      <ol className="mt-3 max-h-[220px] space-y-1 overflow-auto scroll-thin pr-1">
        {props.list.length === 0 && WAITING.map(([title, detail], i) => (
          <li key={title} className="flex gap-2.5 rounded-lg px-1.5 py-1.5 opacity-60">
            <span className="mt-0.5 w-4 shrink-0 text-center text-[11px] mono text-fg-3">{i + 1}</span>
            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-white/[0.04] text-fg-3"><RowIcon /></span>
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
                className={`flex w-full gap-2.5 rounded-lg px-1.5 py-1.5 text-left hover:bg-white/[0.04] ${on ? "bg-white/[0.06]" : ""}`}
              >
                <span className="mt-0.5 w-4 shrink-0 text-center text-[11px] mono text-fg-3">{i + 1}</span>
                <span className="grid size-6 shrink-0 place-items-center rounded-md bg-black/20 text-fg-2" style={{ color }}><RowIcon step={s} /></span>
                <span className="min-w-0">
                  <span className="block text-[12.5px]" style={{ color: color ?? "var(--fg-2)" }}>{row.title}</span>
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
  if (e.kind === "run_end") return e.outcome.verdict === "compromised" ? "External data exfiltration" : "Exfiltration stopped";
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
  if (e.kind === "run_end") return { text: "Defended", tone: "mint" as const };
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
      setAttacker(list[Math.min(1, list.length - 1)].id);
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

  const pick = (s: Step) => {
    closed.current = false;
    run.setCursor(s.t);
    run.setSelected(s);
  };

  const find = async () => {
    if (!run.policy || busy) return;
    setPop(null);
    const made = await run.generate(live ? attacker || undefined : undefined);
    if (made) await run.start(made.body);
  };

  const playLibrary = (a: LibAttack) => {
    if (!run.policy || busy) return;
    setPop(null);
    setDraft(a.body);
    run.open(a);
    void run.start(a.body);
  };

  return (
    <div className="min-h-screen px-3 pt-[76px] pb-4 xl:h-screen xl:overflow-hidden">
      <Nav
        live={live}
        busy={busy || !run.policy}
        busyLabel={!run.policy ? "Connecting…" : run.phase === "running" ? "Running…" : "Generating…"}
        onFind={() => void find()}
      />

      <div className="mx-auto grid h-full max-w-[1440px] gap-3 xl:grid-cols-[248px_minmax(0,1fr)_300px]">
        <Glass radius={22} bezel={16} className={`p-3.5 xl:overflow-auto scroll-thin ${pop === "target" || pop === "attacker" ? "z-20" : ""}`}>
          <div className="relative z-[2] flex h-full flex-col gap-3">
            <div className="rounded-xl bg-white/[0.03] px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]">
              <div className="flex items-center gap-2 text-[12.5px]">
                <span className={live ? "live-dot" : "size-[7px] rounded-full bg-fg-3"} />
                {live ? "OpenRouter connected" : "Sample Replay"}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-fg-3">
                {live ? "The target model runs both realities. Only the policy differs." : "No API key. The scripted agent still calls the real tools, and the policy still decides."}
              </p>
            </div>

            <ModelMenu
              kicker="Target model"
              value={run.model}
              models={models}
              open={pop === "target"}
              disabled={!live || !models.length}
              fallback={live ? "Loading…" : "Scripted agent"}
              onOpen={() => setPop(pop === "target" ? null : "target")}
              onPick={(id) => { run.setModel(id); setPop(null); }}
            />
            <ModelMenu
              kicker="Attacker model"
              value={attacker}
              models={models}
              open={pop === "attacker"}
              disabled={!live || !models.length}
              fallback={live ? "Loading…" : "Built-in library"}
              onOpen={() => setPop(pop === "attacker" ? null : "attacker")}
              onPick={(id) => { setAttacker(id); setPop(null); }}
            />
            <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.04] px-2.5 py-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,.07)]">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-[11px] font-semibold text-[color:var(--ice)]">◇</span>
              <span className="min-w-0">
                <span className="block text-[10px] text-fg-3">Analysis</span>
                <span className="block text-[12.5px]">On-device rules</span>
              </span>
            </div>

            {run.policy && (
              <div className="mt-1 border-t border-white/[0.06] pt-3">
                <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-fg-3">Policy under test</div>
                <PolicyEditor policy={run.policy} onPolicy={run.setPolicy} />
                <p className="mt-2 text-[11px] leading-relaxed text-fg-3">Flip a rule, then run again. The protected reality is the only one that enforces it.</p>
              </div>
            )}
          </div>
        </Glass>

        <Glass radius={24} bezel={18} className="min-h-[640px] xl:min-h-0 xl:overflow-auto scroll-thin">
          <div className="relative z-[2] flex flex-col p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-2xl bg-white/[0.06] shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
                  <Bot size={18} />
                </span>
                <div>
                  <div className="text-[14.5px] font-medium">Northwind Customer-Support Agent</div>
                  <div className="text-[12px] text-fg-3">Reads inbound email, posts a summary to #support-triage.</div>
                </div>
              </div>
              <span className={`chip shrink-0 ${live ? "chip-mint" : ""}`}>{live ? "Live LLM execution" : "Sample Replay"}</span>
            </div>

            <div className="mt-5 flex items-center">
              {STAGES.map((st, i) => (
                <div key={st.id} className="flex min-w-0 flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-1.5 px-1">
                    <span className={`grid size-11 place-items-center rounded-full bg-white/[0.04] ${ring[stageLook(st.id, vA, vB)]}`}>
                      <st.icon size={16} />
                    </span>
                    <div className="text-center">
                      <div className="text-[10.5px] font-medium text-fg-2">{st.label}</div>
                      <div className="hidden text-[10px] text-fg-3 sm:block">{st.sub}</div>
                    </div>
                  </div>
                  {i < STAGES.length - 1 && <span className="mb-7 h-px flex-1 bg-gradient-to-r from-white/20 to-white/[0.04]" />}
                </div>
              ))}
            </div>

            <div className={`relative mt-5 flex flex-wrap items-center gap-2 ${pop === "lib" ? "z-20" : ""}`}>
              <GlassButton variant="primary" onClick={() => void find()} disabled={busy || !run.policy}>
                {busy ? <Loader size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {run.phase === "running" ? "Running…" : run.genBusy ? "Generating…" : "Find Vulnerabilities"}
              </GlassButton>
              <GlassButton onClick={() => setPop(pop === "lib" ? null : "lib")} disabled={busy || !run.policy}>
                <Library size={14} />
                Pick from library
              </GlassButton>
              {run.attack && !busy && (
                <GlassButton onClick={() => void run.start(draft)} disabled={!draft.trim()}>
                  <Play size={14} />
                  Run again
                </GlassButton>
              )}
              {pop === "lib" && (
                <div className="absolute left-0 top-[calc(100%+8px)] z-30 w-[min(420px,100%)] rounded-2xl bg-[#14161a] p-1.5 shadow-[0_18px_50px_-16px_rgba(0,0,0,.85),inset_0_0_0_1px_rgba(255,255,255,.08)]">
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

            {run.note && <p className="mt-2 text-[12px] text-fg-3">{run.note}</p>}

            {run.attack && (
              <div className="mt-3 rounded-xl bg-black/20 px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="chip chip-red">{run.attack.technique}</span>
                  <span className="text-[12.5px]">{run.attack.title}</span>
                  <button type="button" onClick={() => setEditing((v) => !v)} className="ml-auto text-[11.5px] text-fg-3 hover:text-fg">
                    {editing ? "Hide payload" : "Edit payload"}
                  </button>
                </div>
                {editing ? (
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    spellCheck={false}
                    rows={5}
                    className="mt-2 w-full resize-y rounded-xl bg-black/30 p-3 text-[12.5px] leading-relaxed text-fg shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)] outline-none"
                  />
                ) : (
                  <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-fg-3">{draft}</p>
                )}
              </div>
            )}

            <div className="mt-4 grid items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)]">
              <Story branch="A" view={vA} list={listA} running={run.phase === "running"} selected={step?.key ?? null} onPick={pick} />
              <div className="hidden flex-col items-center justify-center gap-2 text-center text-[10px] leading-tight text-fg-3 lg:flex">
                <span>{div ? div.title : "Same task, different outcome"}</span>
                <span className="text-fg-3/80">↔</span>
              </div>
              <Story branch="B" view={vB} list={listB} running={run.phase === "running"} selected={step?.key ?? null} onPick={pick} />
            </div>

            <div className="mt-4 border-t border-white/[0.06] pt-3">
              <div className="mb-2 flex items-end justify-between gap-3">
                <div>
                  <div className="text-[13px] font-medium">Execution timeline</div>
                  <div className="text-[11.5px] text-fg-3">Scrub the attack. Both realities stay on the same clock.</div>
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
                <div className="flex h-12 items-center rounded-2xl bg-white/[0.03] px-4 text-[12px] text-fg-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,.05)]">
                  Hit Find Vulnerabilities. The unprotected agent leaks. OVRIDE blocks the same call.
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/[0.06] pt-3">
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
              <span className="text-[11px] text-fg-3 sm:ml-auto">Fictional sandbox · no real accounts or data</span>
            </div>
          </div>
        </Glass>

        <Glass radius={22} bezel={16} className="xl:overflow-auto scroll-thin">
          <div className="relative z-[2] flex h-full flex-col p-4">
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
                  <ShieldAlert size={18} className="mx-auto text-fg-3" />
                  <p className="mt-3 text-[13px]">Nothing selected</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-fg-3">Run an attack, then click any step. This panel only reads what was recorded.</p>
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <span className={`chip ${pill.tone === "red" ? "chip-red" : pill.tone === "mint" ? "chip-mint" : ""}`}>
                  <ShieldCheck size={12} />
                  {pill.text}
                </span>
                <h2 className="mt-3 text-[16px] font-medium leading-snug tracking-[-0.02em]">{headline(step)}</h2>
                <div className="mt-1 text-[11px] mono text-fg-3">{fmtT(step.t)} · {step.branch === "A" ? "without protection" : "protected"}</div>

                <dl className="mt-4 space-y-4">
                  {([
                    ["What happened?", x.what, FileText],
                    ["Why is it risky?", x.why, TriangleAlert],
                    ["What did OVRIDE do?", x.did, ShieldCheck],
                  ] as const).map(([label, body, Icon]) => (
                    <div key={label}>
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
