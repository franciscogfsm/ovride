"use client";
// The single orchestration hook: lifecycle phases, attack generation, the SSE run stream,
// and the forensic playback cursor. Every UI state derives from `events` + `cursor` via
// pure functions in trace.ts, so what's on screen always maps to a recorded event.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Attack } from "@/lib/attacks";
import type { Branch, TraceEvent } from "@/lib/events";
import type { Policy } from "@/lib/policy";
import type { Step } from "@/lib/trace";
import { outcomes, saveRun, setStore, useStore, type SavedRun } from "@/lib/store";

export type Status = {
  live: boolean;
  defaultModel: string;
  models: { id: string; label: string; price: string }[];
  task: string;
  systemPrompt: string;
  tools: string[];
  defaultPolicy: Policy;
};

export type Phase = "idle" | "generating" | "ready" | "running" | "done";

/** POSTs one run and calls onEvent for every streamed trace event until the stream ends. */
export async function streamRun(req: { attack: string; policy: Policy; model: string }, signal: AbortSignal, onEvent: (e: TraceEvent) => void) {
  const res = await fetch("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attack: req.attack, policy: req.policy, model: req.model || undefined }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`run failed (${res.status})`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i).trim();
      buf = buf.slice(i + 2);
      if (!chunk.startsWith("data:")) continue;
      const ev = JSON.parse(chunk.slice(5).trim());
      if (ev.kind !== "done") onEvent(ev as TraceEvent);
    }
  }
}

export function toSaved(attack: Attack, policy: Policy, model: string, events: TraceEvent[]): SavedRun {
  const start = events.find((e) => e.kind === "run_start");
  const s = start?.kind === "run_start" ? start : null;
  return { id: crypto.randomUUID(), at: Date.now(), attack, model: s?.model ?? model, mode: s?.mode ?? "scripted", policy, events, ...outcomes(events) };
}

const MAX_REPLAY_MS = 26000; // a long live run is replayed compressed to at most this

export function useRun() {
  const { status, policy, model } = useStore();
  const setPolicy = useCallback((p: Policy) => setStore({ policy: p }), []);
  const setModel = useCallback((m: string) => setStore({ model: m }), []);
  const [phase, setPhase] = useState<Phase>("idle");
  const [attack, setAttack] = useState<Attack | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [techniques, setTechniques] = useState<string[]>([]);
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [split, setSplit] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<Step | null>(null);
  const [genBusy, setGenBusy] = useState(false);

  const ac = useRef<AbortController | null>(null);
  const attackRef = useRef<Attack | null>(null);
  const playingRef = useRef(false);
  playingRef.current = playing;
  const eventsRef = useRef<TraceEvent[]>([]);
  eventsRef.current = events;

  const maxT = events.reduce((m, e) => Math.max(m, e.t), 0);
  const duration = Math.max(maxT, 2000);

  const jump = useCallback((t: number) => {
    setCursor(t);
    setPlaying(false);
  }, []);

  useEffect(() => () => ac.current?.abort(), []);

  /** Open an attack (from the library or a saved one) ready to run. */
  const open = useCallback((a: Attack) => {
    ac.current?.abort();
    attackRef.current = a;
    setAttack(a);
    setNote(null);
    setEvents([]);
    setCursor(0);
    setSelected(null);
    setPlaying(false);
    setPhase("ready");
  }, []);

  /** Load a saved run for forensic replay. */
  const load = useCallback((run: SavedRun) => {
    ac.current?.abort();
    attackRef.current = run.attack;
    setAttack(run.attack);
    setNote(null);
    setEvents(run.events);
    setCursor(0);
    setSelected(null);
    setPlaying(false);
    setPhase("done");
  }, []);

  const generate = useCallback(async (genModel?: string): Promise<Attack | null> => {
    ac.current?.abort();
    const g = new AbortController();
    ac.current = g;
    setGenBusy(true);
    setNote(null);
    setPhase((p) => (p === "idle" ? "generating" : p));
    try {
      const res = await fetch("/api/attack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previous: techniques, model: genModel || model || undefined }),
        signal: g.signal,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `status ${res.status}`);
      const attack = json.attack as Attack;
      attackRef.current = attack;
      setAttack(attack);
      setNote(json.note ?? null);
      setTechniques((t) => [...new Set([...t, attack.technique])].slice(-20));
      setEvents([]);
      setCursor(0);
      setSelected(null);
      setPlaying(false);
      setPhase("ready");
      return attack;
    } catch (e) {
      if (g.signal.aborted) return null;
      setNote(`Attack generation failed: ${e instanceof Error ? e.message : String(e)}`);
      setPhase((p) => (p === "generating" ? "idle" : p));
      return null;
    } finally {
      setGenBusy(false);
    }
  }, [techniques, model]);

  const start = useCallback(
    async (body: string) => {
      const current = attackRef.current;
      if (!policy || !current || !body.trim()) return;
      ac.current?.abort();
      const got: TraceEvent[] = [];
      const record = () => got.length && saveRun(toSaved({ ...current, body }, policy, model, got));
      const r = new AbortController();
      ac.current = r;
      setEvents([]);
      setCursor(0);
      setSelected(null);
      setPlaying(true);
      setPhase("running");
      try {
        await streamRun({ attack: body, policy, model }, r.signal, (ev) => {
          got.push(ev);
          setEvents((prev) => [...prev, ev]);
          if (playingRef.current) setCursor(ev.t);
        });
        setPhase((p) => (p === "running" ? "done" : p));
        setPlaying(false);
        record();
      } catch (e) {
        if (r.signal.aborted) return;
        const message = `Network error: ${e instanceof Error ? e.message : String(e)}`;
        record();
        setEvents((prev) => {
          const t = prev.reduce((m, x) => Math.max(m, x.t), 0) + 1;
          const mk = (branch: Branch) => ({
            kind: "error" as const,
            branch,
            message,
            seq: prev.filter((x) => x.branch === branch).length,
            t,
          });
          return [...prev, mk("A"), mk("B")];
        });
        setPhase("done");
        setPlaying(false);
      }
    },
    [policy, model],
  );

  // Replay loop: after the stream ends, play compresses wall-clock time into at most MAX_REPLAY_MS.
  useEffect(() => {
    if (phase !== "done" || !playing) return;
    const dur = Math.max(eventsRef.current.reduce((m, e) => Math.max(m, e.t), 0), 2000);
    const rate = dur <= MAX_REPLAY_MS ? 1 : dur / MAX_REPLAY_MS;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setCursor((c) => {
        const next = Math.min(c + dt * rate, dur);
        if (next >= dur) setPlaying(false);
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, phase]);

  const togglePlay = useCallback(() => {
    if (phase === "running") {
      setPlaying((p) => {
        if (!p) setCursor(eventsRef.current.reduce((m, e) => Math.max(m, e.t), 0));
        return !p;
      });
    } else if (phase === "done") {
      setPlaying((p) => {
        if (!p && cursor >= duration - 30) setCursor(0);
        return !p;
      });
    }
  }, [phase, cursor, duration]);

  const rewind = useCallback(() => {
    setCursor(0);
    setPlaying(false);
  }, []);

  return {
    phase, status, attack, note, events, policy, setPolicy, model, setModel,
    split, setSplit, cursor, setCursor: jump, playing, togglePlay, rewind,
    selected, setSelected, genBusy, generate, start, duration, maxT, open, load,
  };
}
