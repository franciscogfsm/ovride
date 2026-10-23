// Synthesizes the soundtrack, synced to film.html's data-in cues. node sfx.js -> sfx.wav
const fs = require('fs');
const SR = 48000, DUR = 53, N = SR * DUR, TAU = Math.PI * 2;
const L = new Float32Array(N), R = new Float32Array(N), SEND = new Float32Array(N);
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function add(t, buf, gain = 1, pan = 0, rev = .25) {
  const o = Math.round(t * SR), gl = gain * Math.min(1, 1 - pan), gr = gain * Math.min(1, 1 + pan);
  for (let i = 0; i < buf.length; i++) { const j = o + i; if (j < 0 || j >= N) continue;
    L[j] += buf[i] * gl; R[j] += buf[i] * gr; SEND[j] += buf[i] * gain * rev; }
}
const mk = d => new Float32Array(Math.round(d * SR));
const lpA = f => 1 - Math.exp(-TAU * f / SR);

// filtered-noise whoosh; cutoff sweeps lo->hi->lo, peak at `peak` fraction
function whoosh(d, lo = 300, hi = 5000, peak = .7) {
  const b = mk(d); let y1 = 0, y2 = 0, h = 0;
  for (let i = 0; i < b.length; i++) { const p = i / b.length;
    const e = p < peak ? Math.pow(p / peak, 2) : Math.pow(1 - (p - peak) / (1 - peak), 1.5);
    const a = lpA(lo + (hi - lo) * e), n = rnd() * 2 - 1;
    y1 += a * (n - y1); y2 += a * (y1 - y2); h += lpA(150) * (y2 - h); b[i] = (y2 - h) * e * 2.2; }
  return b;
}
function pop(f0, f1, d, k = 40) {
  const b = mk(d); let ph = 0;
  for (let i = 0; i < b.length; i++) { const t = i / SR, f = f0 * Math.pow(f1 / f0, i / b.length); ph += TAU * f / SR;
    b[i] = Math.sin(ph) * Math.exp(-t * k) * Math.min(1, t * 500); }
  return b;
}
function chime(f, d = 1.6) {
  const b = mk(d), P = [[1, 1, 3], [2.01, .45, 5], [3.02, .2, 7], [4.17, .12, 9]];
  for (let i = 0; i < b.length; i++) { const t = i / SR; let s = 0;
    for (const [m, a, k] of P) s += a * Math.sin(TAU * f * m * t) * Math.exp(-t * k);
    b[i] = s * Math.min(1, t * 800) * .6; }
  return b;
}
function boom(d = 2.4) {
  const b = mk(d); let ph = 0;
  for (let i = 0; i < b.length; i++) { const t = i / SR; ph += TAU * (34 + 70 * Math.exp(-t * 6)) / SR;
    const click = t < .012 ? (rnd() * 2 - 1) * (1 - t / .012) * .6 : 0;
    b[i] = Math.tanh(1.8 * Math.sin(ph) * Math.exp(-t * 1.6)) + click; }
  return b;
}
function riser(d) {
  const b = mk(d); let ph = 0, y = 0;
  for (let i = 0; i < b.length; i++) { const p = i / b.length; ph += TAU * (180 * Math.pow(8, p)) / SR;
    y += lpA(400 + 9000 * p * p) * ((rnd() * 2 - 1) - y);
    b[i] = (y * .9 + Math.sin(ph) * .25) * Math.pow(p, 2.2); }
  return b;
}
function tick() {
  const b = mk(.03), f = 2600 + rnd() * 1800;
  for (let i = 0; i < b.length; i++) { const t = i / SR;
    b[i] = (Math.sin(TAU * f * t) * .6 + (rnd() * 2 - 1) * .5) * Math.exp(-t * 260); }
  return b;
}
function alarm() { // two descending buzzy tones
  const b = mk(.9); let ph = 0, y = 0;
  for (let i = 0; i < b.length; i++) { const t = i / SR, f = t < .22 ? 330 : 220; ph += TAU * f / SR;
    const env = (t < .2 ? 1 : t > .25 ? Math.exp(-(t - .25) * 5) : 0) * Math.min(1, (t % .25) * 300);
    y += lpA(1800) * (Math.tanh(4 * Math.sin(ph) + 2 * Math.sin(ph * 1.01)) - y); b[i] = y * env * .7; }
  return b;
}
function glitch(d = .45) {
  const b = mk(d); let v = 0, hold = 0;
  for (let i = 0; i < b.length; i++) { if (hold-- <= 0) { v = rnd() < .5 ? 0 : (rnd() * 2 - 1); hold = 40 + rnd() * 600; }
    b[i] = Math.sign(Math.sin(TAU * (200 + v * 900) * i / SR)) * Math.abs(v) * .35 * (1 - i / b.length); }
  return b;
}
function sweep(d) { // scanner: resonant-ish high sweep
  const b = mk(d); let ph = 0;
  for (let i = 0; i < b.length; i++) { const p = i / b.length; ph += TAU * (1200 + 2600 * p) / SR;
    b[i] = (Math.sin(ph) * .25 + (rnd() * 2 - 1) * .08) * Math.sin(Math.PI * p) * (.6 + .4 * Math.sin(TAU * 18 * p * d)); }
  return b;
}
function hat() { const b = mk(.05); let h = 0; for (let i = 0; i < b.length; i++) { const n = rnd() * 2 - 1; h += lpA(7000) * (n - h); b[i] = (n - h) * Math.exp(-i / SR * 90); } return b; }
function kick() { const b = mk(.35); let ph = 0; for (let i = 0; i < b.length; i++) { const t = i / SR; ph += TAU * (45 + 120 * Math.exp(-t * 30)) / SR; b[i] = Math.sin(ph) * Math.exp(-t * 9); } return b; }

// ---- cues from film.html ----
const html = fs.readFileSync(__dirname + '/film.html', 'utf8');
const cues = [];
for (const m of html.matchAll(/<[^>]*\bdata-in="([\d.]+)"[^>]*>/g)) {
  const tag = m[0], t = +m[1], a = (tag.match(/data-a="(\w+)"/) || [, 'up'])[1];
  cues.push({ t, a, cls: (tag.match(/class="([^"]*)"/) || [, ''])[1], tag });
}
const seen = new Set();
const once = (key, t) => { const k = key + Math.round(t * 10); if (seen.has(k)) return false; seen.add(k); return true; };
let tkPitch = 0;
for (const { t, a, cls, tag } of cues) {
  if (!once(a + cls, t)) continue; // twin lanes share one sound
  const pan = (rnd() - .5) * .5;
  if (a === 'sceneIn' && t > 0) add(t - .35, whoosh(.75, 200, 4200, .55), .55, 0, .35);
  else if (a === 'up' || a === 'left' || a === 'right') { add(t, pop(1500, 950, .09, 55), .07, pan, .4); add(t - .05, whoosh(.35, 800, 6000, .4), .08, pan, .2); }
  else if (a === 'pop' && cls.includes('tk')) add(t, chime(1046 * Math.pow(1.122, tkPitch++)), .2, .2, .5);
  else if (a === 'pop' && cls.includes('verdict')) {}
  else if (a === 'pop') { add(t, pop(620, 300, .18, 22), .3, pan, .3); add(t, chime(1760, .9), .05, pan, .6); }
  else if (a === 'track') { add(t, boom(), .9, 0, .3); add(t, chime(523, 2.5), .14, 0, .8); add(t + .02, chime(784, 2.5), .1, 0, .8); }
  else if (a === 'press') { add(t, pop(2200, 900, .05, 90), .3, 0, .2); add(t, kick(), .35, 0, .1); }
  else if (a === 'reveal') add(t, glitch(), .35, 0, .2);
  else if (a === 'scan') add(t, sweep(1.1), .22, 0, .4);
  else if (a === 'move') for (let k = 0; k < 3; k++) add(t + .2 + k * .09, pop(2400 - k * 500, 1500 - k * 300, .06, 70), .12, .4, .3);
  else if (a === 'draw') add(t, whoosh(.5, 1500, 8000, .5), .05, pan, .3);
  else if (a === 'sheen') add(t + .4, chime(2093, 1.2), .05, 0, .8);
  else if (a === 'pulse') add(t, pop(880, 860, 1.2, 4), .1, 0, .7);
  else if (a === 'strike') add(t, whoosh(.25, 3000, 9000, .2), .2, .3, .1);
  else if (a === 'grow') add(t, pop(400, 800, .5, 6), .07, 0, .5);
  else if (a === 'shine') { add(t, boom(), .7, 0, .3); add(t, chime(659, 3), .12, 0, .8); }
}
// story beats
add(15.3, riser(1.45), .4, 0, .3);                     // build into the logo
add(29.5, alarm(), .35, -.35, .25);                     // lane A: executed
add(29.5, pop(180, 60, .4, 8), .5, .35, .2);            // lane B: shield thud
add(31.2, alarm(), .45, -.3, .3); add(31.2, boom(1.2), .35, -.3, .2);
[1046, 1318, 1568, 2093].forEach((f, i) => add(31.4 + i * .07, chime(f), .2, .3, .55)); // DEFENDED
add(40.9, alarm(), .22, -.2, .2);                       // rejected smuggling call
// typing ticks
for (const m of html.matchAll(/data-type="([^"]*)" data-t="([\d.]+)" data-cps="(\d+)"/g)) {
  const [, s, t0, cps] = m;
  for (let k = 1; k <= s.length; k++) if (s[k - 1] !== ' ') add(+t0 + k / cps, tick(), .07, (rnd() - .5) * .4, .1);
}
// pulse under split reality + guard: kick 4-on-floor, offbeat hats, pad ducking
const kicks = [];
for (let t = 25.2; t < 36.4; t += .5) kicks.push(t);
for (let t = 37.2; t < 47.5; t += 1) kicks.push(t);
kicks.forEach(t => { add(t, kick(), .32, 0, .05); if (t < 36.4) add(t + .25, hat(), .05, .3, .1); });

// ---- ambient pad: Am - F - C - G, detuned additive saws, lowpassed, ducked by kicks ----
const chords = [[110, 130.81, 164.81, 220], [87.31, 110, 130.81, 174.61], [130.81, 164.81, 196, 261.63], [98, 123.47, 146.83, 196]];
const pad = new Float32Array(N), CH = 4;
for (let c = 0; c * CH < DUR; c++) {
  const notes = chords[c % 4], s0 = c * CH * SR, len = (CH + 1.5) * SR;
  for (const f0 of notes) for (const det of [-.004, .004]) { const f = f0 * (1 + det);
    for (let h = 1; h <= 6; h++) { const w = TAU * f * h / SR, amp = 1 / h; let ph = rnd() * TAU;
      for (let i = 0; i < len && s0 + i < N; i++) { const e = Math.min(1, i / (1.2 * SR), (len - i) / (1.5 * SR));
        pad[s0 + i] += Math.sin(ph) * amp * e * .02; ph += w; } } }
}
let y = 0;
for (let i = 0; i < N; i++) { const t = i / SR;
  y += lpA(700 + 500 * Math.sin(TAU * t / 9)) * (pad[i] - y);
  let lvl = t < 16.2 ? .55 : t < 16.8 ? .55 * (1 - (t - 16.2) / .6) : t < 17.5 ? (t - 16.8) / .7 : 1;
  lvl *= Math.min(1, (DUR - t) / 1.5);
  let duck = 1; for (const k of kicks) { const d = t - k; if (d >= 0 && d < .3) duck = Math.min(duck, .55 + .45 * d / .3); }
  L[i] += y * lvl * duck * .9; R[i] += y * lvl * duck * .9; SEND[i] += y * lvl * .3; }

// ---- reverb (Schroeder) on SEND ----
function comb(inp, d, fb) { const o = new Float32Array(N), buf = new Float32Array(d); let p = 0, lp = 0;
  for (let i = 0; i < N; i++) { const v = buf[p]; lp += .3 * (v - lp); o[i] = v; buf[p] = inp[i] + lp * fb; p = (p + 1) % d; } return o; }
function allp(inp, d, g) { const o = new Float32Array(N), buf = new Float32Array(d); let p = 0;
  for (let i = 0; i < N; i++) { const v = buf[p], x = inp[i] + v * g; o[i] = v - x * g; buf[p] = x; p = (p + 1) % d; } return o; }
for (const [side, ds] of [[L, [1557, 1617, 1491, 1422]], [R, [1277, 1356, 1188, 1116]]]) {
  const sum = new Float32Array(N);
  for (const d of ds) { const c = comb(SEND, Math.round(d * SR / 44100 * 1.6), .86); for (let i = 0; i < N; i++) sum[i] += c[i] * .25; }
  const out = allp(allp(sum, 556, .5), 225, .5);
  for (let i = 0; i < N; i++) side[i] += out[i] * .55;
}

// ---- master: soft clip, normalize to -1 dBFS, 16-bit WAV ----
let pk = 0; for (let i = 0; i < N; i++) { L[i] = Math.tanh(L[i] * 1.2); R[i] = Math.tanh(R[i] * 1.2); pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); }
const g = .89 / pk, wav = Buffer.alloc(44 + N * 4);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + N * 4, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28);
wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { wav.writeInt16LE(Math.round(L[i] * g * 32767), 44 + i * 4); wav.writeInt16LE(Math.round(R[i] * g * 32767), 46 + i * 4); }
fs.writeFileSync(__dirname + '/sfx.wav', wav);
console.log('cues', cues.length, 'peak', pk.toFixed(2));
