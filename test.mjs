import assert from 'node:assert/strict';
import { Squid, buildSkin, DT, MAX_STEPS_PER_FRAME, PRESETS, mulberry32 } from './sim.js';

const run = (s, secs, each) => { for (let i = 0, n = Math.round(secs / DT); i < n; i++) { each?.(i * DT); s.step(); } };
const pos = (s, i) => [s.x[3 * i], s.x[3 * i + 1], s.x[3 * i + 2]];
const dorsal = s => s.rings[4].o[0];

function bodyFrame(s, X = s.x) {
  const R = s.bodyRotation(), c = s.regions[0].c, out = [];
  for (let i = 0; i < s.bodyEnd; i++) {
    const d = [X[3 * i] - c[0], X[3 * i + 1] - c[1], X[3 * i + 2] - c[2]];
    out.push([0, 1, 2].map(k => R[k] * d[0] + R[3 + k] * d[1] + R[6 + k] * d[2]));
  }
  return out;
}
const rms = (a, b) => Math.sqrt(a.reduce((acc, p, i) => acc + (p[0] - b[i][0]) ** 2 + (p[1] - b[i][1]) ** 2 + (p[2] - b[i][2]) ** 2, 0) / a.length);

function maxEdgeStretch(s) {
  let m = 0;
  for (let e = 0; e < s.ne; e++) {
    const a = pos(s, s.edges[2 * e]), b = pos(s, s.edges[2 * e + 1]);
    m = Math.max(m, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / s.eRest[e]);
  }
  return m;
}

function intact(s, skin, label) {
  assert.ok(s.x.every(Number.isFinite), `${label}: non-finite particle`);
  assert.ok(s.minY() >= -1e-6, `${label}: particle below floor ${s.minY()}`);
  assert.equal(s.invertedTets(), 0, `${label}: inverted tets`);
  assert.ok(maxEdgeStretch(s) < 2.7, `${label}: edge overstretched`);
  const dyn = skin.update(s.interp(), s.bodyRotation());
  assert.ok(dyn.every(Number.isFinite), `${label}: non-finite skin`);
  for (let v = 0; v < skin.skinV; v++) assert.ok(dyn[6 * v + 1] >= 0.0039, `${label}: skin vertex ${v} below floor`);
  assert.equal(s.events.filter(e => e.type === 'reset').length, 0, `${label}: solver had to reset`);
}

function settle(s, skin, label, secs = 8) {
  run(s, secs);
  intact(s, skin, label);
  assert.ok(s.kinetic() < 2e-4, `${label}: still moving, KE=${s.kinetic()}`);
}

function lift(s, id, i, dy, secs) {
  const p0 = pos(s, i);
  s.grab(id, p0, 0);
  run(s, secs, t => s.moveGrab(id, [p0[0], p0[1] + dy * Math.min(1, t / (secs * 0.5)), p0[2]]));
  return p0;
}

const base = new Squid();
const skin = buildSkin(base);

{
  settle(base, skin, 'initial settle');
  console.log('ok  settles from the drop without inverting or sinking');
}
const ref = bodyFrame(base);
const restC = (() => { const s = new Squid(); s.x.set(s.rest); s.shapeMatch(s.regions[0]); return s.regions[0].c; })();
const eyeRef = [0, 1].map(e => skin.eyeCenter(base.rest, e).map((v, d) => v - restC[d]));

{
  const s = new Squid(); s.x.set(base.x);
  const i = dorsal(s), p0 = lift(s, 1, i, 0.9, 1.6);
  run(s, 1, t => s.moveGrab(1, [p0[0] + 0.4 * Math.sin(t * 9), p0[1] + 0.9, p0[2]]));
  assert.ok(s.grabs.has(1), 'mantle grab should survive a gentle lift');
  s.release(1);
  const sig = [];
  run(s, 2.5, () => sig.push(s.x[3 * i + 1] - s.regions[0].c[1]));
  let extrema = 0;
  for (let k = 1; k < sig.length - 1; k++) if ((sig[k] - sig[k - 1]) * (sig[k + 1] - sig[k]) < 0 && Math.abs(sig[k] - sig[k - 1]) > 1e-5) extrema++;
  assert.ok(extrema >= 2, `mantle should wobble after release, extrema=${extrema}`);
  settle(s, skin, 'mantle lift');
  const err = rms(bodyFrame(s), ref);
  assert.ok(err < 0.02, `mantle should regain its rest shape, rms=${err}`);
  console.log(`ok  mantle lift: wobbles (${extrema} turns) then returns to rest shape (rms ${err.toFixed(4)})`);
}

{
  const s = new Squid(); s.x.set(base.x);
  const A = s.arms[3], tip = s.centroid(A.rings[9]);
  s.grab(2, tip, 2 + 3);
  let maxStretch = 1, peeledAt = -1;
  run(s, 3, t => {
    s.moveGrab(2, [tip[0] - 2.5 * Math.min(1, t / 0.6), tip[1] + 0.3, tip[2] + 1.0 * Math.min(1, t / 0.6)]);
    maxStretch = Math.max(maxStretch, s.armStretch(3));
    if (peeledAt < 0 && !s.grabs.has(2)) peeledAt = t;
  });
  assert.ok(maxStretch > 1.3, `arm should visibly stretch, got ${maxStretch}`);
  assert.ok(maxStretch < 2.6, `arm stretch must stay bounded, got ${maxStretch}`);
  s.release(2);
  settle(s, skin, 'arm stretch');
  const err = rms(bodyFrame(s), ref);
  assert.ok(err < 0.02, `body shape after arm pull rms=${err}`);
  console.log(`ok  arm pull: stretches to ${maxStretch.toFixed(2)}x, peels at ${peeledAt.toFixed(2)}s, recovers (rms ${err.toFixed(4)})`);
}

{
  const yank = (mat, i) => {
    const s = new Squid(); s.x.set(base.x);
    const p0 = i >= 0 ? pos(s, i) : s.centroid(s.arms[5].rings[8]);
    s.grab(3, p0, mat);
    let at = Infinity;
    run(s, 2, t => { s.moveGrab(3, [p0[0] + 3 * Math.min(1, t / 0.35), 0.2, p0[2]]); if (at === Infinity && !s.grabs.has(3)) at = t; });
    settle(s, skin, `yank mat ${mat}`);
    return at;
  };
  const arm = yank(2 + 5, -1), tm = yank(0, dorsal(base));
  assert.ok(arm > tm, `suckers should hold longer than the mantle (arm ${arm}s, mantle ${tm}s)`);
  console.log(`ok  same yank: mantle slips at ${tm.toFixed(2)}s, suckers hold until ${arm === Infinity ? 'never' : arm.toFixed(2) + 's'}`);
}

{
  const s = new Squid(); s.x.set(base.x);
  const rnd = mulberry32(7);
  for (let c = 0; c < 30; c++) {
    const armHit = rnd() < 0.5, k = Math.floor(rnd() * 10);
    const i = armHit ? s.arms[k].p0 + Math.floor(rnd() * (s.arms[k].p1 - s.arms[k].p0)) : Math.floor(rnd() * s.finEnd);
    const p0 = pos(s, i), goal = [p0[0] + (rnd() - 0.5) * 3, 0.1 + rnd() * 2, p0[2] + (rnd() - 0.5) * 3];
    s.grab(10 + c, p0, armHit ? 2 + k : 0);
    run(s, 0.3 + rnd() * 0.6, () => s.moveGrab(10 + c, goal));
    s.release(10 + c);
    run(s, 0.1 + rnd() * 0.8);
    intact(s, skin, `repeat ${c}`);
  }
  settle(s, skin, 'repeated grabs', 10);
  const err = rms(bodyFrame(s), ref);
  assert.ok(err < 0.02, `after 30 random grabs rms=${err}`);
  console.log(`ok  30 random grab/release cycles stay intact and recover (rms ${err.toFixed(4)})`);
}

{
  const s = new Squid(); s.x.set(base.x);
  const i = dorsal(s), p0 = lift(s, 4, i, 2.0, 1.4);
  run(s, 0.6, () => s.moveGrab(4, [p0[0], -1, p0[2]]));
  intact(s, skin, 'slam into floor');
  lift(s, 4, i, 2.2, 1.4);
  s.release(4);
  let low = Infinity;
  run(s, 3, () => { low = Math.min(low, s.minY()); });
  assert.ok(low >= -1e-6, `drop penetrated floor: ${low}`);
  settle(s, skin, 'drop');
  console.log('ok  slam and drop: nothing passes through the floor');
}

{
  const keys = ['softness', 'volume', 'drag', 'suction', 'clarity', 'chroma'];
  const cases = [...keys.flatMap(k => [0, 1].map(v => ({ label: `${k}=${v}`, p: { [k]: v } }))), ...PRESETS.map(p => ({ label: p.name, p: p.values }))];
  for (const c of cases) {
    const s = new Squid(); s.x.set(base.x);
    Object.assign(s.params, c.p);
    run(s, 1);
    const p0 = lift(s, 5, dorsal(s), 1.0, 1);
    run(s, 0.8, t => s.moveGrab(5, [p0[0] + 0.6 * Math.sin(t * 12), p0[1] + 1, p0[2]]));
    s.release(5);
    const tip = s.centroid(s.arms[1].rings[9]);
    s.grab(6, tip, 3);
    run(s, 1, () => s.moveGrab(6, [tip[0] - 2, tip[1] + 0.5, tip[2]]));
    s.release(6);
    settle(s, skin, c.label, 10);
  }
  console.log(`ok  ${cases.length} slider extremes and presets stay stable and come to rest`);
}

{
  const s = new Squid(); s.x.set(base.x);
  lift(s, 7, dorsal(s), 1.2, 1.5);
  s.release(7);
  settle(s, skin, 'eyes');
  const R = s.bodyRotation(), c = s.regions[0].c;
  for (let e = 0; e < 2; e++) {
    const p = skin.eyeCenter(s.x, e), d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
    const local = [0, 1, 2].map(k => R[k] * d[0] + R[3 + k] * d[1] + R[6 + k] * d[2]);
    const drift = Math.hypot(...local.map((v, k) => v - eyeRef[e][k]));
    assert.ok(drift < 0.04, `eye ${e} drifted ${drift}`);
  }
  console.log('ok  eyes stay seated in the head');
}

{
  const s = new Squid();
  s.paused = true;
  assert.equal(s.advance(0.5), 0, 'pause must not step');
  s.paused = false; s.timeScale = 0.25;
  let steps = 0;
  for (let f = 0; f < 60; f++) steps += s.advance(1 / 60);
  assert.ok(Math.abs(steps - 15) <= 1, `slow motion stepped ${steps} times in 1s`);
  s.timeScale = 1;
  assert.equal(s.advance(5), MAX_STEPS_PER_FRAME, 'a long frame must be capped');
  const a = new Squid(), b = new Squid();
  let bs = 0;
  for (let f = 0; f < 240; f++) bs += b.advance(1 / 240);
  for (let k = 0; k < bs; k++) a.step();
  assert.ok(a.x.every((v, i) => Math.abs(v - b.x[i]) < 1e-12), 'fixed step must not depend on frame rate');
  s.grab(9, pos(s, dorsal(s)), 0); s.reset();
  assert.equal(s.grabs.size, 0, 'reset releases grabs');
  console.log('ok  pause, slow motion, frame cap, frame-rate independence, reset');
}
