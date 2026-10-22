"use client";
// Liquid glass: a per-element lens. A canvas-generated displacement map (rounded-rect SDF, strongest
// at the rim) drives an SVG feDisplacementMap through backdrop-filter, split per colour channel for
// slight chromatic dispersion. Chromium only; elsewhere the CSS fallback (blur + specular) applies.
import { motion, useMotionValue, useSpring, type HTMLMotionProps } from "motion/react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

const maps = new Map<string, string>();

function lensMap(w: number, h: number, r: number, bezel: number) {
  const k = `${w}x${h}x${r}x${bezel}`;
  const hit = maps.get(k);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const cx = w / 2, cy = h / 2, bx = cx - r, by = cy - r;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const qx = Math.abs(dx) - bx, qy = Math.abs(dy) - by;
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
      const d = -(Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r); // distance inside the edge
      let nx = 0, ny = 0;
      if (ox > 0 && oy > 0) { const l = Math.hypot(ox, oy); nx = ox / l; ny = oy / l; }
      else if (qx > qy) nx = 1;
      else ny = 1;
      nx *= Math.sign(dx) || 1;
      ny *= Math.sign(dy) || 1;
      const t = Math.min(Math.max(1 - d / bezel, 0), 1);
      const m = t * t * (3 - 2 * t); // smooth rim falloff
      const i = (y * w + x) * 4;
      img.data[i] = 128 - nx * m * 127;
      img.data[i + 1] = 128 - ny * m * 127;
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  const url = c.toDataURL();
  maps.set(k, url);
  return url;
}

let refractCache: boolean | null = null;
function canRefract() {
  if (refractCache !== null) return refractCache;
  const ua = navigator.userAgent;
  const reduced = matchMedia("(prefers-reduced-transparency: reduce)").matches;
  refractCache = /Chrome\/|Chromium\/|Edg\//.test(ua) && !/Firefox\//.test(ua) && !reduced;
  return refractCache;
}

type GlassProps = Omit<HTMLMotionProps<"div">, "children"> & {
  children?: ReactNode;
  radius?: number;
  bezel?: number;
  strength?: number;
  blur?: number;
  tone?: "smoke" | "clear";
};

export function Glass({ children, radius = 22, bezel = 18, strength = 46, blur = 3, tone = "smoke", className = "", style, ...rest }: GlassProps) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId().replace(/:/g, "");
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [refract, setRefract] = useState(false);

  useLayoutEffect(() => {
    setRefract(canRefract());
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.borderBoxSize?.[0]?.inlineSize ?? el.offsetWidth);
      const h = Math.round(e.borderBoxSize?.[0]?.blockSize ?? el.offsetHeight);
      setSize((s) => (s && s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const map = refract && size && size.w > 0 && size.h > 0 ? lensMap(size.w, size.h, Math.min(radius, size.h / 2, size.w / 2), bezel) : null;

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  const backdrop = map ? `url(#lens-${id}) blur(${blur}px) saturate(1.7) brightness(0.92)` : undefined;
  return (
    <motion.div
      ref={ref}
      onPointerMove={onMove}
      className={`glass glass-${tone} ${map ? "glass-refract" : ""} ${className}`}
      style={{ borderRadius: radius, ...(backdrop ? { backdropFilter: backdrop, WebkitBackdropFilter: backdrop } : {}), ...(style as CSSProperties) }}
      {...rest}
    >
      {map && size && (
        <svg width="0" height="0" aria-hidden style={{ position: "absolute" }}>
          <filter id={`lens-${id}`} x="0" y="0" width={size.w} height={size.h} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feImage href={map} x="0" y="0" width={size.w} height={size.h} preserveAspectRatio="none" result="map" />
            {[1, 1.08, 1.16].map((k, i) => (
              <g key={i}>
                <feDisplacementMap in="SourceGraphic" in2="map" scale={strength * k} xChannelSelector="R" yChannelSelector="G" result={`d${i}`} />
                <feColorMatrix in={`d${i}`} type="matrix" result={`c${i}`}
                  values={["1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0", "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0", "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"][i]} />
              </g>
            ))}
            <feBlend in="c0" in2="c1" mode="screen" result="rg" />
            <feBlend in="rg" in2="c2" mode="screen" />
          </filter>
        </svg>
      )}
      <span className="glass-sheen" aria-hidden />
      {children}
    </motion.div>
  );
}

type ButtonProps = Omit<HTMLMotionProps<"button">, "children"> & { children?: ReactNode; variant?: "glass" | "primary" | "ghost"; size?: "sm" | "md" | "lg" };

/** A button with a light magnetic pull toward the pointer and a springy press. */
export function GlassButton({ children, variant = "glass", size = "md", className = "", disabled, ...rest }: ButtonProps) {
  const x = useMotionValue(0), y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 300, damping: 20, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 300, damping: 20, mass: 0.4 });
  const pad = size === "sm" ? "h-8 px-3 text-[12.5px]" : size === "lg" ? "h-12 px-6 text-[15px]" : "h-10 px-4 text-[13.5px]";
  return (
    <motion.button
      type="button"
      disabled={disabled}
      style={{ x: sx, y: sy }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        x.set(((e.clientX - r.left) / r.width - 0.5) * 4);
        y.set(((e.clientY - r.top) / r.height - 0.5) * 3);
        e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
      onPointerLeave={() => { x.set(0); y.set(0); }}
      whileHover={disabled ? undefined : { scale: 1.025 }}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={{ type: "spring", stiffness: 420, damping: 26 }}
      className={`btn btn-${variant} ${pad} ${className}`}
      {...rest}
    >
      <span className="glass-sheen" aria-hidden />
      <span className="relative inline-flex items-center gap-2">{children}</span>
    </motion.button>
  );
}

/** Tracks a boolean with a short delay, so transient states don't flicker. */
export function useDelayed(value: boolean, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), value ? ms : 0);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
