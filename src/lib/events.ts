import type { Decision } from "./policy";

export type Branch = "A" | "B"; // A = unprotected (monitor only), B = OVRIDE enforcing

export type Outcome = {
  verdict: "compromised" | "defended" | "resisted" | "incomplete";
  exfiltrated: { to: string; fields: string[] }[]; // executed sends of confidential data to unapproved destinations
  blocked: number;
  externalSends: number;
  taskCompleted: boolean; // a summary reached #support-triage
  summary: string;
};

type Base = { branch: Branch; seq: number; t: number };
export type TraceEvent = Base &
  (
    | { kind: "run_start"; mode: "live" | "scripted"; model: string; enforce: boolean }
    | { kind: "model"; text: string; stopReason: string; step: number }
    | { kind: "tool_call"; callId: string; tool: string; args: Record<string, string>; decision: Decision | null; error?: string }
    | { kind: "tool_result"; callId: string; tool: string; status: "executed" | "blocked" | "invalid"; result: unknown; flags: string[] }
    | { kind: "run_end"; outcome: Outcome }
    | { kind: "error"; message: string }
  );

export type EventKind = TraceEvent["kind"];
