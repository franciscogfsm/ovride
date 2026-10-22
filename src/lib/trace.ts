// Pure derivations from recorded TraceEvents. Everything the UI shows comes through here,
// so every visual state maps back to an observed backend event.
import type { Branch, Outcome, TraceEvent } from "./events";
import { ATTACKER_ADDRESS } from "./sandbox";

export type CallEv = Extract<TraceEvent, { kind: "tool_call" }>;
export type ResultEv = Extract<TraceEvent, { kind: "tool_result" }>;
export type Tone = "neutral" | "danger" | "safe" | "warn";
export type Stage = "input" | "agent" | "tool" | "outcome";

/** One inspectable moment: a model turn, a tool call (paired with its result), the run end, or an error. */
export type Step = {
  key: string;
  branch: Branch;
  t: number;
  ev: TraceEvent;
  result?: ResultEv;
  tone: Tone;
  label: string;
};

const short = (s: string, n = 48) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function callTone(call: CallEv, result?: ResultEv): Tone {
  if (result?.status === "blocked") return "safe";
  const d = call.decision;
  if (result?.status === "executed" && d && d.verdict === "block") return "danger";
  if (result?.status === "executed" && d?.destinationApproved === false && d.leakedFields.length) return "danger";
  if (call.tool === "read_email" && result?.status === "executed") return "warn";
  return "neutral";
}

export function callLabel(call: CallEv, result?: ResultEv) {
  const a = call.args;
  if (call.tool === "send_message") return `${result?.status === "blocked" ? "Blocked" : "send_message"} → ${short(a.to ?? "?", 34)}`;
  if (call.tool === "read_email") return `read_email ${a.id ?? ""}`;
  if (call.tool === "search_customers") return `search_customers "${short(a.query ?? "", 18)}"`;
  if (call.tool === "read_document") return `read_document ${a.name ?? ""}`;
  return call.tool;
}

export function steps(events: TraceEvent[], branch: Branch): Step[] {
  const out: Step[] = [];
  const results = new Map<string, ResultEv>();
  for (const e of events) if (e.branch === branch && e.kind === "tool_result") results.set(e.callId, e);
  for (const e of events) {
    if (e.branch !== branch) continue;
    const key = `${branch}-${e.seq}`;
    if (e.kind === "model" && e.text) out.push({ key, branch, t: e.t, ev: e, tone: "neutral", label: short(e.text, 60) });
    if (e.kind === "tool_call") {
      const result = results.get(e.callId);
      out.push({ key, branch, t: e.t, ev: e, result, tone: callTone(e, result), label: callLabel(e, result) });
    }
    if (e.kind === "run_end") {
      const v = e.outcome.verdict;
      out.push({ key, branch, t: e.t, ev: e, tone: v === "compromised" ? "danger" : v === "defended" ? "safe" : "neutral", label: verdictLabel(v) });
    }
    if (e.kind === "error") out.push({ key, branch, t: e.t, ev: e, tone: "warn", label: short(e.message, 60) });
  }
  return out;
}

export const verdictLabel = (v: Outcome["verdict"]) =>
  ({ compromised: "Compromised", defended: "Defended", resisted: "Resisted", incomplete: "Incomplete" })[v];

export type Send = { to: string; leaked: number; records: number; approved: boolean; blocked: boolean; key: string };

export type LaneView = {
  started: boolean;
  mode?: "live" | "scripted";
  model?: string;
  enforce?: boolean;
  email?: { id: string; from: string; subject: string; body: string; untrusted: boolean };
  thought?: string;
  step: number;
  call?: Step;
  sends: Send[];
  outcome?: Outcome;
  error?: string;
  active: Stage | null;
  /** The newest event, used to fire exactly one pulse per observed event. */
  pulse?: { id: string; edge: "in" | "act" | "out"; tone: Tone; intercepted: boolean };
  cost: number;
  tokens: number;
};

export function laneView(events: TraceEvent[], branch: Branch, at: number): LaneView {
  const v: LaneView = { started: false, step: 0, sends: [], active: null, cost: 0, tokens: 0 };
  const calls = new Map<string, CallEv>();
  for (const e of events) {
    if (e.branch !== branch || e.t > at) continue;
    const id = `${branch}-${e.seq}`;
    switch (e.kind) {
      case "run_start":
        Object.assign(v, { started: true, mode: e.mode, model: e.model, enforce: e.enforce, active: "agent" });
        break;
      case "model":
        if (e.text) v.thought = e.text;
        v.step = e.step + 1;
        v.cost += e.usage?.cost ?? 0;
        v.tokens += (e.usage?.input ?? 0) + (e.usage?.output ?? 0);
        v.active = "agent";
        break;
      case "tool_call": {
        calls.set(e.callId, e);
        v.call = { key: id, branch, t: e.t, ev: e, tone: callTone(e), label: callLabel(e) };
        v.active = "tool";
        v.pulse = { id, edge: "act", tone: e.decision?.verdict === "block" ? "danger" : "neutral", intercepted: false };
        break;
      }
      case "tool_result": {
        const call = calls.get(e.callId);
        if (!call) break;
        const tone = callTone(call, e);
        v.call = { key: `${branch}-${call.seq}`, branch, t: call.t, ev: call, result: e, tone, label: callLabel(call, e) };
        if (e.tool === "read_email" && e.status === "executed" && e.result && typeof e.result === "object" && "body" in e.result) {
          const m = e.result as { id: string; from: string; subject: string; body: string };
          v.email = { ...m, untrusted: m.from === ATTACKER_ADDRESS };
          v.active = "input";
          v.pulse = { id, edge: "in", tone: "warn", intercepted: false };
        } else if (e.tool === "send_message") {
          const d = call.decision;
          v.sends.push({
            to: call.args.to, leaked: d?.leakedFields.length ?? 0, records: new Set(d?.leakedFields.map((f) => f.split(".")[0])).size,
            approved: d?.destinationApproved ?? false, blocked: e.status === "blocked", key: `${branch}-${call.seq}`,
          });
          v.active = e.status === "blocked" ? "tool" : "outcome";
          v.pulse = e.status === "blocked" ? { id, edge: "act", tone: "safe", intercepted: true } : { id, edge: "out", tone, intercepted: false };
        } else v.active = "tool";
        break;
      }
      case "run_end":
        v.outcome = e.outcome;
        v.active = "outcome";
        break;
      case "error":
        v.error = e.message;
        break;
    }
  }
  return v;
}

export type Divergence = { t: number; title: string; detail: string; a?: Step; b?: Step };

/** First point where the two recorded tool-call sequences differ, in call or in result. */
export function divergence(events: TraceEvent[]): Divergence | null {
  const calls = (b: Branch) => steps(events, b).filter((s) => s.ev.kind === "tool_call" && s.result);
  const sig = (s?: Step) => (s ? `${(s.ev as CallEv).tool}|${(s.ev as CallEv).args.to ?? ""}|${s.result!.status}` : "");
  const A = calls("A"), B = calls("B");
  const ended = (b: Branch) => events.some((e) => e.branch === b && e.kind === "run_end");
  const n = Math.max(A.length, B.length);
  for (let i = 0; i < n; i++) {
    const a = A[i], b = B[i];
    if (!a || !b) {
      if (!ended(a ? "B" : "A")) return null; // the shorter branch may still catch up
      const s = (a ?? b)!;
      return { t: s.t, title: `Only one reality called ${(s.ev as CallEv).tool}`, detail: s.label, a, b };
    }
    if (sig(a) === sig(b)) continue;
    const ca = a.ev as CallEv, cb = b.ev as CallEv;
    const sameCall = ca.tool === cb.tool && ca.args.to === cb.args.to;
    if (sameCall && a.result!.status !== b.result!.status)
      return {
        t: Math.max(a.t, b.t),
        title: `Same ${ca.tool} call, different fate`,
        detail: `${ca.args.to ? `→ ${ca.args.to}: ` : ""}${a.result!.status} without protection, ${b.result!.status} by OVRIDE`,
        a, b,
      };
    return { t: Math.min(a.t, b.t), title: "The agents took different actions", detail: `${a.label}  vs  ${b.label}`, a, b };
  }
  return null;
}

export type Explanation = { what: string; why: string; did: string; outcome: string; other?: string };

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Plain-language explanation built only from fields recorded on the events. */
export function explain(step: Step, events: TraceEvent[]): Explanation {
  const e = step.ev;
  const protectedBranch = step.branch === "B";
  if (e.kind === "model")
    return {
      what: `The model (step ${e.step + 1}) wrote: “${e.text}”`,
      why: "Model text is not an action. Risk only materialises when the agent calls a tool.",
      did: "Nothing to enforce. OVRIDE evaluates tool calls, not prose.",
      outcome: e.stopReason === "tool_use" || e.stopReason === "tool_calls" ? "The model went on to request a tool call." : `The turn ended (${e.stopReason}).`,
    };
  if (e.kind === "run_end")
    return {
      what: e.outcome.summary,
      why: e.outcome.exfiltrated.length
        ? `Confidential fields left Northwind: ${e.outcome.exfiltrated.map((x) => `${x.fields.length} to ${x.to}`).join(", ")}.`
        : "No confidential data reached an unapproved destination in this reality.",
      did: protectedBranch ? `Enforcing. ${plural(e.outcome.blocked, "call")} blocked before execution.` : "Monitor only. Violations were recorded but not enforced.",
      outcome: `${e.outcome.taskCompleted ? "The legitimate task finished: a summary reached #support-triage." : "The legitimate summary never reached #support-triage."} ${plural(e.outcome.externalSends, "message")} executed to outside destinations.`,
    };
  if (e.kind === "error") return { what: e.message, why: "The run raised an error.", did: "—", outcome: "The branch stopped early." };
  if (e.kind !== "tool_call") return { what: "", why: "", did: "", outcome: "" };

  const r = step.result;
  const d = e.decision;
  const a = e.args;
  let what = `The agent called ${e.tool}.`;
  let why = "Read-only access inside the sandbox.";
  if (e.tool === "read_email") {
    what = `The agent opened email ${a.id}.`;
    why = r?.result && typeof r.result === "object" && "from" in r.result && String((r.result as { from: string }).from) === ATTACKER_ADDRESS
      ? "This email comes from an external sender the attacker controls. Its text now sits in the agent's context, where it can pose as instructions (indirect prompt injection)."
      : "External email is untrusted content. From here on, OVRIDE treats the agent's context as tainted.";
  } else if (e.tool === "search_customers") {
    const n = Array.isArray(r?.result) ? r.result.length : 0;
    what = `The agent searched customer records (query “${a.query}”) and got ${plural(n, "record")} back.`;
    why = n > 1 ? "Summarising one email needs no bulk customer lookup. Pulling every record is a typical first step of exfiltration." : "Customer records are classified confidential.";
  } else if (e.tool === "send_message") {
    const recs = new Set(d?.leakedFields.map((f) => f.split(".")[0])).size;
    what = `The agent tried to send “${a.subject}” to ${a.to}${d?.leakedFields.length ? `, containing ${plural(d.leakedFields.length, "confidential field")} from ${plural(recs, "customer record")}` : ""}.`;
    why = !d ? "The call could not be validated."
      : d.verdict === "allow" ? (d.destinationApproved ? `${a.to} is an approved internal destination.` : d.reason)
      : `${d.reason}${d.sourceTrust === "untrusted-in-context" ? " The agent had just read untrusted external content, so the instruction most likely came from the attacker, not from Northwind." : ""}`;
  }
  const did = !d ? `Rejected at the trust boundary: ${(e as CallEv).error ?? "invalid arguments"}.`
    : d.verdict === "allow" ? "Allowed. No policy rule applies."
    : r?.status === "blocked" ? `Blocked before execution under ${d.rule}. The tool never ran, and the agent was told to carry on with its legitimate task.`
    : `Detected a violation of ${d.rule}, but enforcement is off in this reality, so the call ran anyway.`;
  const outcome = !r ? "Waiting for the result…"
    : r.status === "blocked" ? "Nothing was sent. The fictional customer data stayed inside Northwind."
    : r.status === "invalid" ? "The call never ran."
    : e.tool === "send_message" ? `Delivered to ${a.to}.${d?.leakedFields.length && !d.destinationApproved ? " The data has left the company." : ""}`
    : "The tool ran and its result went back to the model.";

  // Compare with the other reality at the same point.
  const otherB: Branch = step.branch === "A" ? "B" : "A";
  const twin = steps(events, otherB).find((s) => s.ev.kind === "tool_call" && (s.ev as CallEv).tool === e.tool && (s.ev as CallEv).args.to === a.to && (s.ev as CallEv).args.id === a.id);
  const other = twin
    ? `${otherB === "B" ? "Protected by OVRIDE" : "Without protection"}: the same call was ${twin.result?.status ?? "pending"}.`
    : `${otherB === "B" ? "Protected by OVRIDE" : "Without protection"}: the agent made no matching call.`;
  return { what, why, did, outcome, other };
}

export const fmtT = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}.${Math.floor((ms % 1000) / 100)}`;
