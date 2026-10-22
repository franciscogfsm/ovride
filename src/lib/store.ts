"use client";
// Platform state shared across pages: saved runs, custom attacks, the active policy and model.
// shortcut: persisted to localStorage (per browser, capped), move to a server DB when there are real users/teams.
import { useEffect, useSyncExternalStore } from "react";
import type { Attack } from "@/lib/attacks";
import type { Outcome, TraceEvent } from "@/lib/events";
import type { Policy } from "@/lib/policy";
import type { Status } from "@/lib/use-run";

export type SavedRun = {
  id: string;
  at: number;
  attack: Attack;
  model: string;
  mode: "live" | "scripted";
  policy: Policy;
  events: TraceEvent[];
  a?: Outcome;
  b?: Outcome;
};

type State = {
  runs: SavedRun[];
  attacks: Attack[];
  policy: Policy | null;
  model: string;
  pending: Attack | null; // handed from the Attacks page to the Lab
  status: Status | null;
};

const KEY = "ovride:v1";
const MAX_RUNS = 40;
const empty: State = { runs: [], attacks: [], policy: null, model: "", pending: null, status: null };
let state = empty;
let loaded = false;
const subs = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (saved) state = { ...state, runs: saved.runs ?? [], attacks: saved.attacks ?? [], policy: saved.policy ?? null, model: saved.model ?? "" };
  } catch {}
}

function persist() {
  const { runs, attacks, policy, model } = state;
  for (let n = runs.length; n >= 0; n--) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ runs: runs.slice(0, n), attacks, policy, model }));
      return;
    } catch {} // quota exceeded: retry with fewer runs
  }
}

export function setStore(patch: Partial<State> | ((s: State) => Partial<State>)) {
  load();
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  persist();
  subs.forEach((f) => f());
}

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

export function useStore() {
  const s = useSyncExternalStore(subscribe, () => (load(), state), () => empty);
  useStatusLoader();
  return s;
}

let statusReq: Promise<void> | null = null;
function useStatusLoader() {
  useEffect(() => {
    statusReq ??= fetch("/api/status")
      .then((r) => r.json())
      .then((s: Status) => setStore((st) => ({ status: s, policy: st.policy ?? s.defaultPolicy, model: st.model || s.defaultModel })))
      .catch(() => { statusReq = null; });
  }, []);
}

export function saveRun(run: SavedRun) {
  setStore((s) => ({ runs: [run, ...s.runs.filter((r) => r.id !== run.id)].slice(0, MAX_RUNS) }));
}

export function outcomes(events: TraceEvent[]) {
  const end = (b: "A" | "B") => events.find((e) => e.branch === b && e.kind === "run_end") as Extract<TraceEvent, { kind: "run_end" }> | undefined;
  return { a: end("A")?.outcome, b: end("B")?.outcome };
}
