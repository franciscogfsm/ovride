"use client";
// Forensic scrubber. Every tick is a recorded step; the playhead only moves through real timestamps.
import { useRef } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Glass, GlassButton } from "./glass";
import type { Branch, TraceEvent } from "@/lib/events";
import { fmtT, steps, type Divergence, type Step, type Tone } from "@/lib/trace";

const toneBg: Record<Tone, string> = {
  neutral: "bg-white/75",
  danger: "bg-[color:var(--red)]",
  safe: "bg-[color:var(--mint)]",
  warn: "bg-[color:var(--red)]",
};

export function Timeline(props: {
  events: TraceEvent[];
  cursor: number;
  duration: number;
  playing: boolean;
  running: boolean;
  divergence: Divergence | null;
  onTogglePlay: () => void;
  onRewind: () => void;
  onScrub: (t: number) => void;
  onSelect: (step: Step) => void;
  inline?: boolean;
}) {
  const { events, cursor, duration, playing, divergence: div, onTogglePlay, onRewind, onScrub, onSelect } = props;
  const track = useRef<HTMLDivElement>(null);
  const pct = duration > 0 ? Math.min(100, Math.max(0, (cursor / duration) * 100)) : 0;
  const at = (b: Branch) => [...steps(events, b)].reverse().find((s) => s.t <= cursor + 1);

  const seek = (clientX: number) => {
    const el = track.current;
    if (!el || duration <= 0) return;
    const r = el.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    onScrub(p * duration);
  };

  return (
    <div className={props.inline ? "w-full" : "fixed bottom-3 left-0 right-0 lg:left-[var(--side)] z-40 flex justify-center px-3 sm:px-4 pointer-events-none"}>
      <Glass radius={26} bezel={16} tone="smoke" className={props.inline ? "w-full px-3 py-2.5 sm:px-4" : "pointer-events-auto w-full max-w-[1180px] px-3 py-2.5 sm:px-4"}>
        <div className="relative z-[2] flex items-center gap-3">
          <div className="flex items-center gap-1.5 shrink-0">
            <GlassButton size="sm" aria-label="Rewind to the start" onClick={onRewind} className="!size-8 !px-0">
              <RotateCcw size={13} />
            </GlassButton>
            <GlassButton size="sm" aria-label={playing ? "Pause" : "Play"} onClick={onTogglePlay} className="!size-8 !px-0">
              {playing ? <Pause size={13} /> : <Play size={13} className="translate-x-[1px]" />}
            </GlassButton>
          </div>

          <div className="min-w-0 flex-1 flex flex-col gap-1.5">
            <div
              ref={track}
              role="slider"
              tabIndex={0}
              aria-label="Execution time"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(cursor)}
              className="relative h-8 cursor-ew-resize outline-none"
              onPointerDown={(e) => {
                (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                seek(e.clientX);
              }}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) seek(e.clientX);
              }}
              onKeyDown={(e) => {
                const step = Math.max(duration * 0.02, 80);
                if (e.key === "ArrowLeft") onScrub(Math.max(0, cursor - step));
                if (e.key === "ArrowRight") onScrub(Math.min(duration, cursor + step));
                if (e.key === "Home") onRewind();
              }}
            >
              {(["A", "B"] as const).map((b, row) => (
                <span key={b} className="absolute left-0 right-0 h-px bg-white/10" style={{ top: row === 0 ? 8 : 22 }} />
              ))}
              {(["A", "B"] as const).map((b, row) =>
                steps(events, b).map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    title={s.label}
                    aria-label={`${b === "A" ? "Without protection" : "Protected"}: ${s.label}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onScrub(s.t);
                      onSelect(s);
                    }}
                    className={`absolute size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full ${toneBg[s.tone]} hover:scale-125`}
                    style={{ left: `${duration > 0 ? (s.t / duration) * 100 : 0}%`, top: row === 0 ? 8 : 22 }}
                  />
                )),
              )}
              <span className="absolute top-0 bottom-0 w-px bg-[color:var(--ice)] pointer-events-none" style={{ left: `${pct}%` }} />
            </div>
            <p className="truncate text-[11.5px] text-fg-3">
              <span className="text-[color:var(--red)]">Without protection</span> {at("A")?.label ?? "—"}
              <span className="mx-1.5 text-white/20">·</span>
              <span className="text-[color:var(--mint)]">Protected</span> {at("B")?.label ?? "—"}
            </p>
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="mono text-[11.5px] text-fg-2 tabular-nums">{fmtT(cursor)}</span>
            {div && (
              <button
                type="button"
                className="chip chip-mint !h-5 cursor-pointer"
                onClick={() => {
                  onScrub(div.t);
                  const step = div.b ?? div.a;
                  if (step) onSelect(step);
                }}
              >
                Diverged
              </button>
            )}
          </div>
        </div>
      </Glass>
    </div>
  );
}
