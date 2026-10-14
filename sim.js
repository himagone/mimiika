export const DT = 1 / 60;
export const SUBSTEPS = 12;
export const MAX_STEPS_PER_FRAME = 4;
export const TANK = { x: 4.4, z: 3.4, top: 3.0 };

const G = -1.4, VMAX = 7, MU = 0.3, GRAB_SPEED = 9, DAMP_TAU = 0.006;

export const MATS = [
  { name: 'mantle', E: 30, k: 0.5 },
  { name: 'head', E: 180, k: 0.8 },
  { name: 'fin', E: 28, k: 0.15 },
  { name: 'arm', E: 40, k: 0.72 },
  { name: 'tentacle', E: 10, k: 0.35 },
];
const MANTLE = 0, HEAD = 1, FIN = 2, ARM = 3, TENT = 4;

export const DEFAULTS = { softness: 0.5, volume: 0.8, drag: 0.45, suction: 0.6, clarity: 0.55, chroma: 0.4 };
export const PRESETS = [
  { name: '標準', values: { ...DEFAULTS } },
  { name: 'ぷるぷる', values: { softness: 0.8, volume: 0.9, drag: 0.22, suction: 0.5, clarity: 0.75, chroma: 0.3 } },
  { name: '筋肉質', values: { softness: 0.2, volume: 0.7, drag: 0.65, suction: 0.85, clarity: 0.38, chroma: 0.55 } },
  { name: '警戒色', values: { softness: 0.45, volume: 0.8, drag: 0.5, suction: 0.7, clarity: 0.3, chroma: 0.95 } },
];

const PI = Math.PI;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, t) => { t = clamp((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => mul(a, 1 / (len(a) || 1));
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const catmull = (p0, p1, p2, p3, t) =>
  0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
const catmull3 = (a, b, c, d, t) => [0, 1, 2].map(i => catmull(a[i], b[i], c[i], d[i], t));
const matVec = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const physics = p => ({ stiff: 2 ** ((0.5 - p.softness) * 4), kappa: 10 ** (p.volume * 3), drag: 0.3 * 12 ** p.drag });

const BODY_Y = 0.42, X0 = 0.92, XLEN = 1.58, CROWN_S = 0.9;
const PROF = [[0.22, 0.4], [0.36, 0.41], [0.48, 0.37], [0.57, 0.29], [0.63, 0.235], [0.7, 0.25], [0.78, 0.27], [0.86, 0.24], [0.9, 0.21]];

export function bodyRadius(s) {
  if (s <= 0.22) { const t = 1 - s / 0.22; return 0.4 * Math.sqrt(Math.max(0, 1 - t * t)); }
  if (s >= 0.9) { const t = (s - 0.9) / 0.1; return 0.21 * Math.sqrt(Math.max(0, 1 - t * t)); }
  let i = 0;
  while (s > PROF[i + 1][0]) i++;
  const r = j => PROF[clamp(j, 0, PROF.length - 1)][1];
  return catmull(r(i - 1), r(i), r(i + 1), r(i + 2), (s - PROF[i][0]) / (PROF[i + 1][0] - PROF[i][0]));
}

export function bodyPoint(s, th, sc = 1) {
  const r = bodyRadius(s) * sc, b = smooth(0.55, 0.7, s);
  return [X0 - XLEN * s, BODY_Y + Math.cos(th) * r * lerp(0.92, 0.8, b), Math.sin(th) * r * lerp(1, 1.18, b)];
}

export const ORGANS = [
  { id: 20, c: [0.3, 0.29, 0], r: [0.16, 0.055, 0.065] },
  { id: 21, c: [0.27, 0.27, 0.085], r: [0.085, 0.045, 0.055] },
  { id: 21, c: [0.27, 0.27, -0.085], r: [0.085, 0.045, 0.055] },
  { id: 22, c: [0.2, 0.3, 0.22], r: [0.15, 0.04, 0.03] },
  { id: 22, c: [0.2, 0.3, -0.22], r: [0.15, 0.04, 0.03] },
  { id: 23, c: [0.45, 0.47, 0], r: [0.19, 0.12, 0.13] },
  { id: 24, c: [-0.28, 0.44, 0], r: [0.1, 0.09, 0.11] },
];

const ARM_SPECS = [
  ...[22.5, 67.5, 112.5, 157.5].flatMap((d, k) =>
    [-1, 1].map(side => ({ phi: (side * d * PI) / 180, len: [0.5, 0.62, 0.66, 0.58][k], r0: 0.075, tent: false }))),
  { phi: (-135 * PI) / 180, len: 1.05, r0: 0.04, tent: true },
  { phi: (135 * PI) / 180, len: 1.05, r0: 0.04, tent: true },
];
const ARM_RINGS = 11;

function buildModel() {
  const P = [], pmat = [], gsc = [], crad = [];
  const T = [], tmat = [];
  const att = [];
  const addP = (p, m, g = 1, r = 0) => { P.push(p); pmat.push(m); gsc.push(g); crad.push(r); return P.length - 1; };
  const vol = (a, b, c, d) => dot(cross(sub(P[b], P[a]), sub(P[c], P[a])), sub(P[d], P[a])) / 6;
  const addTet = (a, b, c, d, m) => { if (vol(a, b, c, d) < 0) [c, d] = [d, c]; T.push([a, b, c, d]); tmat.push(m); };
  const prism = (a, b, c, d, e, f, m) => { addTet(a, b, c, d, m); addTet(b, c, d, e, m); addTet(c, d, e, f, m); };
  const attach = (i, lo, hi) => {
    const ds = [];
    for (let j = lo; j < hi; j++) ds.push([len(sub(P[j], P[i])), j]);
    ds.sort((a, b) => a[0] - b[0]);
    for (const [, j] of ds.slice(0, 3)) att.push([i, j]);
  };

  const RINGS = 14, AROUND = 12;
  const matAt = s => (s > 0.6 ? HEAD : MANTLE);
  const gAt = p => clamp(1 - (1.4 * (p[1] - BODY_Y)) / 0.4, -0.6, 2.6);
  const addB = (p, m) => addP(p, m, gAt(p), 0);
  const rings = [];
  const tip = addB(bodyPoint(-0.015, 0, 0), MANTLE);
  for (let i = 0; i < RINGS; i++) {
    const s = 0.03 + (0.94 * i) / (RINGS - 1);
    const c = addB(bodyPoint(s, 0, 0), matAt(s));
    const o = [];
    for (let j = 0; j < AROUND; j++) o.push(addB(bodyPoint(s, (2 * PI * j) / AROUND, 1.03), matAt(s)));
    rings.push({ s, c, o });
  }
  const front = addB(bodyPoint(1.015, 0, 0), HEAD);
  for (let i = 0; i < RINGS - 1; i++) {
    const A = rings[i], B = rings[i + 1], m = matAt((A.s + B.s) / 2);
    for (let j = 0; j < AROUND; j++) {
      const j1 = (j + 1) % AROUND;
      prism(A.c, A.o[j], A.o[j1], B.c, B.o[j], B.o[j1], m);
    }
  }
  for (let j = 0; j < AROUND; j++) {
    const j1 = (j + 1) % AROUND;
    addTet(tip, rings[0].c, rings[0].o[j], rings[0].o[j1], MANTLE);
    addTet(front, rings[RINGS - 1].c, rings[RINGS - 1].o[j1], rings[RINGS - 1].o[j], HEAD);
  }
  const bodyEnd = P.length, bodyTetEnd = T.length;

  const fins = [];
  for (const side of [-1, 1]) {
    const th = side * (PI / 2 - (25 * PI) / 180);
    const sp = bodyPoint(0.33, th, 1);
    const ax = [1, 0, 0], out = [0, Math.cos(th), Math.sin(th)], nrm = norm(cross(ax, out));
    const A = [-0.22, -0.073, 0.073, 0.22], B = [-0.05, 0.15, 0.36], W = [-0.045, 0.045];
    const lo = P.length, t0 = T.length;
    const id = A.map(a => B.map(b => W.map(w => addP(add(sp, add(mul(ax, a), add(mul(out, b), mul(nrm, w)))), FIN, 0.6, 0))));
    for (let ia = 0; ia < 3; ia++) for (let ib = 0; ib < 2; ib++) {
      const v = (dx, dy, dz) => id[ia + dx][ib + dy][dz];
      const [a, b, c, d, e, f, g, h] = [v(0, 0, 0), v(1, 0, 0), v(1, 1, 0), v(0, 1, 0), v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1)];
      for (const [p, q] of [[b, c], [c, d], [d, h], [h, e], [e, f], [f, b]]) addTet(a, p, q, g, FIN);
    }
    for (let ia = 0; ia < 4; ia++) for (const iw of [0, 1]) attach(id[ia][0][iw], 0, bodyEnd);
    fins.push({
      side, lo, hi: P.length, t0, t1: T.length, ax, out, nrm, c: add(sp, mul(out, 0.12)),
      flap: id.flatMap(col => [...col[1].map(i => [i, 0.4]), ...col[2].map(i => [i, 1])]),
    });
  }
  const finEnd = P.length;

  const crown = [X0 - XLEN * CROWN_S, BODY_Y - 0.02, 0];
  const arms = ARM_SPECS.map((sp, k) => {
    const mat = sp.tent ? TENT : ARM;
    const radial = [0, Math.cos(sp.phi), Math.sin(sp.phi)];
    const side = Math.sign(sp.phi) || 1;
    const start = add(crown, mul(radial, sp.tent ? 0.08 : 0.12));
    const d0 = norm([-1, 0.75 * radial[1], 0.9 * radial[2]]);
    const dT = sp.tent ? norm([-1, -0.45, 0.4 * side]) : norm([-0.75, -1, 0.8 * radial[2]]);
    const rho = t => sp.tent ? 0.04 * (1 - 0.45 * t) + 0.024 * Math.exp(-(((t - 0.84) / 0.09) ** 2)) : sp.r0 * (1 - 0.78 * t);
    const N = ARM_RINGS, pts = [start];
    for (let i = 1; i < N; i++) {
      const t = i / (N - 1);
      let d = norm(lerp3(d0, dT, smooth(0, 0.6, t)));
      if (!sp.tent) d = norm(add(d, [0, 1.1 * smooth(0.65, 1, t), 0]));
      const p = add(pts[i - 1], mul(d, sp.len / (N - 1)));
      p[1] = Math.max(p[1], rho(t) + 0.015);
      pts.push(p);
    }
    const tang = pts.map((_, i) => norm(sub(pts[Math.min(i + 1, N - 1)], pts[Math.max(i - 1, 0)])));
    let o = mul(radial, -1);
    const frames = tang.map(t => { o = norm(sub(o, mul(t, dot(o, t)))); return { t, o, b: cross(t, o) }; });
    const rings = pts.map((c, i) => {
      const r = rho(i / (N - 1)), f = frames[i];
      return [0, 1, 2].map(q => {
        const a = (q * 2 * PI) / 3;
        return addP(add(c, add(mul(f.o, r * Math.cos(a)), mul(f.b, r * Math.sin(a)))), mat, 1, 0.22 * r);
      });
    });
    const t0 = T.length;
    for (let i = 0; i < N - 1; i++) prism(...rings[i], ...rings[i + 1], mat);
    const tipP = addP(add(pts[N - 1], mul(tang[N - 1], rho(1) * 1.5)), mat, 1, 0.004);
    addTet(tipP, ...rings[N - 1], mat);
    for (const i of [...rings[0], ...rings[1]]) attach(i, 0, bodyEnd);
    let restLen = 0;
    for (let i = 1; i < N; i++) restLen += len(sub(pts[i], pts[i - 1]));
    return { k, tent: sp.tent, pts, frames, rho, rings, t0, t1: T.length, p0: rings[0][0], p1: tipP + 1, restLen };
  });

  const n = P.length, nt = T.length;
  const rest = new Float64Array(3 * n);
  P.forEach((p, i) => rest.set(p, 3 * i));
  const mass = new Float64Array(n);
  const tets = new Int32Array(4 * nt), tRest = new Float64Array(nt), tAlpha = new Float64Array(nt), tMant = new Uint8Array(nt);
  const emap = new Map();
  const edgeOf = (a, b) => {
    const key = a < b ? a * n + b : b * n + a;
    let e = emap.get(key);
    if (!e) emap.set(key, (e = { a, b, V: 0, E: 0 }));
    return e;
  };
  T.forEach((t, ti) => {
    const V = vol(...t), E = MATS[tmat[ti]].E;
    tets.set(t, 4 * ti); tRest[ti] = V; tAlpha[ti] = V / E; tMant[ti] = tmat[ti] === MANTLE ? 1 : 0;
    for (const i of t) mass[i] += V / 4;
    for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) {
      const e = edgeOf(t[p], t[q]);
      e.V += V / 6; e.E = Math.max(e.E, E);
    }
  });
  for (const [i, j] of att) { const e = edgeOf(i, j); e.V += 0.0015; e.E = Math.max(e.E, MATS[HEAD].E); }
  const es = [...emap.values()];
  const edges = new Int32Array(2 * es.length), eRest = new Float64Array(es.length), eAlpha = new Float64Array(es.length);
  es.forEach((e, k) => {
    const L = len(sub(P[e.a], P[e.b]));
    edges[2 * k] = e.a; edges[2 * k + 1] = e.b; eRest[k] = L; eAlpha[k] = (L * L) / (e.E * e.V);
  });
  const w = mass.map(m => 1 / Math.max(m, 1e-6));
  const isArm = new Uint8Array(n).map((_, i) => (pmat[i] === ARM || pmat[i] === TENT ? 1 : 0));

  const region = (lo, hi, k) => {
    let M = 0; const c = [0, 0, 0];
    for (let i = lo; i < hi; i++) { M += mass[i]; for (let d = 0; d < 3; d++) c[d] += mass[i] * rest[3 * i + d]; }
    const r0 = new Float64Array(3 * (hi - lo));
    for (let i = lo; i < hi; i++) for (let d = 0; d < 3; d++) r0[3 * (i - lo) + d] = rest[3 * i + d] - c[d] / M;
    return { lo, hi, k, r0, q: [0, 0, 0, 1], c: c.map(v => v / M) };
  };
  const regions = [region(0, bodyEnd, 4e-5), ...fins.map(f => region(f.lo, f.hi, 2e-5)), ...arms.map(a => region(a.p0, a.p1, 1.5e-5))];

  const eyes = [-1, 1].map(side => {
    const axis = norm([-0.3, 0.35, side]), e1 = norm(cross([0, 1, 0], axis)), e2 = cross(axis, e1);
    return { side, c: [-0.29, 0.475, 0.245 * side], r: 0.112, frame: [e1[0], e2[0], axis[0], e1[1], e2[1], axis[1], e1[2], e2[2], axis[2]] };
  });

  return {
    n, nt, rest, mass, w, crad: Float64Array.from(crad), gs: Float64Array.from(gsc), isArm,
    edges, eRest, eAlpha, ne: es.length, tets, tRest, tAlpha, tMant,
    rings, fins, arms, regions, eyes, bodyEnd, finEnd, bodyTetEnd,
    x: new Float64Array(3 * n), prev: new Float64Array(3 * n), v: new Float64Array(3 * n),
    prevStep: new Float64Array(3 * n), xr: new Float64Array(3 * n),
  };
}

function quatToMat(q, R) {
  const [x, y, z, w] = q;
  R[0] = 1 - 2 * (y * y + z * z); R[1] = 2 * (x * y - z * w); R[2] = 2 * (x * z + y * w);
  R[3] = 2 * (x * y + z * w); R[4] = 1 - 2 * (x * x + z * z); R[5] = 2 * (y * z - x * w);
  R[6] = 2 * (x * z - y * w); R[7] = 2 * (y * z + x * w); R[8] = 1 - 2 * (x * x + y * y);
  return R;
}

// Müller et al. 2016; polar decomposition by Higham iteration flips to a reflection when a region inverts.
function extractRotation(A, q, iters, R) {
  for (let it = 0; it < iters; it++) {
    quatToMat(q, R);
    let ox = 0, oy = 0, oz = 0, d = 0;
    for (let c = 0; c < 3; c++) {
      const rx = R[c], ry = R[3 + c], rz = R[6 + c], ax = A[c], ay = A[3 + c], az = A[6 + c];
      ox += ry * az - rz * ay; oy += rz * ax - rx * az; oz += rx * ay - ry * ax; d += rx * ax + ry * ay + rz * az;
    }
    const s = 1 / (Math.abs(d) + 1e-9);
    ox *= s; oy *= s; oz *= s;
    const ang = Math.hypot(ox, oy, oz);
    if (ang < 1e-9) break;
    const h = 0.5 * ang, sn = Math.sin(h) / ang, bx = ox * sn, by = oy * sn, bz = oz * sn, bw = Math.cos(h);
    const [qx, qy, qz, qw] = q;
    q[0] = bw * qx + bx * qw + by * qz - bz * qy;
    q[1] = bw * qy - bx * qz + by * qw + bz * qx;
    q[2] = bw * qz + bx * qy - by * qx + bz * qw;
    q[3] = bw * qw - bx * qx - by * qy - bz * qz;
    const l = Math.hypot(q[0], q[1], q[2], q[3]);
    for (let i = 0; i < 4; i++) q[i] /= l;
  }
}

export class Squid {
  constructor() {
    Object.assign(this, buildModel());
    this.params = { ...DEFAULTS };
    this.alive = false;
    this.paused = false;
    this.timeScale = 1;
    this.grabs = new Map();
    this.events = [];
    this._A = new Float64Array(9);
    this._R = new Float64Array(9);
    this.reset();
  }

  reset() {
    this.x.set(this.rest);
    for (let i = 1; i < this.x.length; i += 3) this.x[i] += 0.12;
    this.v.fill(0);
    this.prev.set(this.x); this.prevStep.set(this.x); this.xr.set(this.x);
    this.grabs.clear();
    this.acc = 0; this.time = 0;
    for (const r of this.regions) r.q = [0, 0, 0, 1];
  }

  advance(realDt) {
    if (this.paused) return 0;
    this.acc += Math.min(realDt, 0.1) * this.timeScale;
    let steps = 0;
    while (this.acc >= DT && steps < MAX_STEPS_PER_FRAME) { this.step(); this.acc -= DT; steps++; }
    this.acc = Math.min(this.acc, DT * 0.999);
    return steps;
  }

  interp() {
    const a = this.acc / DT, { x, prevStep, xr } = this;
    for (let i = 0; i < x.length; i++) xr[i] = prevStep[i] + (x[i] - prevStep[i]) * a;
    return xr;
  }

  grab(id, hit, mat) {
    const arm = mat >= 2 ? mat - 2 : -1;
    const [lo, hi, R] = arm >= 0 ? [this.arms[arm].p0, this.arms[arm].p1, 0.11] : [0, this.finEnd, 0.24];
    const idx = [], wt = [];
    let best = lo, bd = Infinity;
    for (let i = lo; i < hi; i++) {
      const d = Math.hypot(this.x[3 * i] - hit[0], this.x[3 * i + 1] - hit[1], this.x[3 * i + 2] - hit[2]);
      if (d < bd) { bd = d; best = i; }
      if (d < R) { idx.push(i); wt.push((1 - d / R) ** 2); }
    }
    if (!idx.length) { idx.push(best); wt.push(1); }
    const sw = wt.reduce((a, b) => a + b, 0);
    const off = new Float64Array(3 * idx.length);
    idx.forEach((i, q) => { for (let d = 0; d < 3; d++) off[3 * q + d] = this.x[3 * i + d] - hit[d]; });
    this.grabs.set(id, { kind: arm >= 0 ? 'arm' : 'body', arm, idx, wt: wt.map(v => v / sw), off, target: [...hit], goal: [...hit], stretch: 1 });
  }

  moveGrab(id, p) {
    const g = this.grabs.get(id);
    if (!g) return;
    g.goal = [clamp(p[0], -TANK.x + 0.2, TANK.x - 0.2), clamp(p[1], 0.08, TANK.top - 0.2), clamp(p[2], -TANK.z + 0.2, TANK.z - 0.2)];
  }

  release(id) { this.grabs.delete(id); }

  step() {
    this.prevStep.set(this.x);
    for (const g of this.grabs.values()) {
      const d = sub(g.goal, g.target), l = len(d), mx = GRAB_SPEED * DT;
      g.target = l > mx ? add(g.target, mul(d, mx / l)) : [...g.goal];
    }
    const h = DT / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) this.substep(h, this.time + s * h);
    this.time += DT;
    this.checkGrabs();
    for (let i = 0; i < this.x.length; i++) if (!Number.isFinite(this.x[i])) { this.reset(); this.events.push({ type: 'reset' }); break; }
  }

  substep(h, t) {
    const { x, prev, v, w, gs, isArm, n } = this;
    const ph = physics(this.params);
    const dB = Math.exp(-ph.drag * h), dA = Math.exp(-ph.drag * 1.8 * h);
    for (let i = 0; i < n; i++) {
      const i3 = 3 * i;
      v[i3 + 1] += G * gs[i] * h;
      const d = isArm[i] ? dA : dB;
      v[i3] *= d; v[i3 + 1] *= d; v[i3 + 2] *= d;
      const sp = Math.sqrt(v[i3] * v[i3] + v[i3 + 1] * v[i3 + 1] + v[i3 + 2] * v[i3 + 2]);
      if (sp > VMAX) { const s = VMAX / sp; v[i3] *= s; v[i3 + 1] *= s; v[i3 + 2] *= s; }
    }
    if (this.alive) {
      const R = quatToMat(this.regions[0].q, this._R), a = 0.9 * Math.sin(2 * PI * 0.8 * t) * h;
      for (const f of this.fins) {
        const nn = matVec(R, f.nrm);
        for (const [i, s] of f.flap) for (let d = 0; d < 3; d++) v[3 * i + d] += nn[d] * a * s;
      }
    }
    for (let i = 0; i < 3 * n; i++) { prev[i] = x[i]; x[i] += v[i] * h; }

    this.solveGrabs(h);
    this.solveEdges(h, ph.stiff);
    this.solveTets(h, ph.stiff * ph.kappa, this.alive ? 1 + 0.035 * Math.sin((2 * PI * t) / 3.2) : 1);
    for (const r of this.regions) this.shapeMatch(r);
    this.collide();

    const ih = 1 / h;
    for (let i = 0; i < 3 * n; i++) v[i] = (x[i] - prev[i]) * ih;
    for (let i = 0; i < n; i++) if (w[i] === 0) v[3 * i] = v[3 * i + 1] = v[3 * i + 2] = 0;
  }

  solveGrabs(h) {
    const { x, w } = this, ih2 = 1 / (h * h);
    for (const g of this.grabs.values()) {
      const kg = g.kind === 'arm' ? 90 * (0.4 + this.params.suction) : 30;
      for (let q = 0; q < g.idx.length; q++) {
        const i3 = 3 * g.idx[q];
        const dx = x[i3] - g.target[0] - g.off[3 * q], dy = x[i3 + 1] - g.target[1] - g.off[3 * q + 1], dz = x[i3 + 2] - g.target[2] - g.off[3 * q + 2];
        const C = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (C < 1e-9) continue;
        const wi = w[g.idx[q]], dl = -C / (wi + ih2 / (kg * g.wt[q])), s = (wi * dl) / C;
        x[i3] += dx * s; x[i3 + 1] += dy * s; x[i3 + 2] += dz * s;
      }
    }
  }

  solveEdges(h, stiff) {
    const { x, prev, w, edges, eRest, eAlpha, ne } = this, ih2 = 1 / (h * h * stiff), gam = DAMP_TAU / h;
    for (let e = 0; e < ne; e++) {
      const i = edges[2 * e], j = edges[2 * e + 1], i3 = 3 * i, j3 = 3 * j;
      const dx = x[i3] - x[j3], dy = x[i3 + 1] - x[j3 + 1], dz = x[i3 + 2] - x[j3 + 2];
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (L < 1e-9) continue;
      const wi = w[i], wj = w[j], ws = wi + wj, L0 = eRest[e];
      const rel = ((x[i3] - prev[i3] - x[j3] + prev[j3]) * dx + (x[i3 + 1] - prev[i3 + 1] - x[j3 + 1] + prev[j3 + 1]) * dy + (x[i3 + 2] - prev[i3 + 2] - x[j3 + 2] + prev[j3 + 2]) * dz) / L;
      const dl = L > 2.6 * L0 ? -(L - 2.6 * L0) / ws : -(L - L0 + gam * rel) / ((1 + gam) * ws + eAlpha[e] * ih2);
      const s = dl / L;
      x[i3] += dx * s * wi; x[i3 + 1] += dy * s * wi; x[i3 + 2] += dz * s * wi;
      x[j3] -= dx * s * wj; x[j3 + 1] -= dy * s * wj; x[j3 + 2] -= dz * s * wj;
    }
  }

  solveTets(h, kappa, breath) {
    const { x, w, tets, tRest, tAlpha, tMant, nt } = this, ih2 = 1 / (h * h * kappa);
    for (let t = 0; t < nt; t++) {
      const ia = tets[4 * t], ib = tets[4 * t + 1], ic = tets[4 * t + 2], id = tets[4 * t + 3];
      const a = 3 * ia, b = 3 * ib, c = 3 * ic, d = 3 * id;
      const e1x = x[b] - x[a], e1y = x[b + 1] - x[a + 1], e1z = x[b + 2] - x[a + 2];
      const e2x = x[c] - x[a], e2y = x[c + 1] - x[a + 1], e2z = x[c + 2] - x[a + 2];
      const e3x = x[d] - x[a], e3y = x[d + 1] - x[a + 1], e3z = x[d + 2] - x[a + 2];
      const g1x = (e2y * e3z - e2z * e3y) / 6, g1y = (e2z * e3x - e2x * e3z) / 6, g1z = (e2x * e3y - e2y * e3x) / 6;
      const g2x = (e3y * e1z - e3z * e1y) / 6, g2y = (e3z * e1x - e3x * e1z) / 6, g2z = (e3x * e1y - e3y * e1x) / 6;
      const g3x = (e1y * e2z - e1z * e2y) / 6, g3y = (e1z * e2x - e1x * e2z) / 6, g3z = (e1x * e2y - e1y * e2x) / 6;
      const g0x = -g1x - g2x - g3x, g0y = -g1y - g2y - g3y, g0z = -g1z - g2z - g3z;
      const wa = w[ia], wb = w[ib], wc = w[ic], wd = w[id];
      const ws = wa * (g0x * g0x + g0y * g0y + g0z * g0z) + wb * (g1x * g1x + g1y * g1y + g1z * g1z) +
        wc * (g2x * g2x + g2y * g2y + g2z * g2z) + wd * (g3x * g3x + g3y * g3y + g3z * g3z);
      if (ws < 1e-14) continue;
      const V = e1x * g1x + e1y * g1y + e1z * g1z;
      const C = V - tRest[t] * (tMant[t] ? breath : 1);
      const s = -C / (ws + tAlpha[t] * ih2);
      x[a] += s * wa * g0x; x[a + 1] += s * wa * g0y; x[a + 2] += s * wa * g0z;
      x[b] += s * wb * g1x; x[b + 1] += s * wb * g1y; x[b + 2] += s * wb * g1z;
      x[c] += s * wc * g2x; x[c + 1] += s * wc * g2y; x[c + 2] += s * wc * g2z;
      x[d] += s * wd * g3x; x[d + 1] += s * wd * g3y; x[d + 2] += s * wd * g3z;
    }
  }

  shapeMatch(rg) {
    const { x, mass } = this, A = this._A.fill(0);
    let M = 0, cx = 0, cy = 0, cz = 0;
    for (let i = rg.lo; i < rg.hi; i++) { const m = mass[i]; M += m; cx += m * x[3 * i]; cy += m * x[3 * i + 1]; cz += m * x[3 * i + 2]; }
    cx /= M; cy /= M; cz /= M;
    for (let i = rg.lo, o = 0; i < rg.hi; i++, o += 3) {
      const m = mass[i], dx = m * (x[3 * i] - cx), dy = m * (x[3 * i + 1] - cy), dz = m * (x[3 * i + 2] - cz);
      const rx = rg.r0[o], ry = rg.r0[o + 1], rz = rg.r0[o + 2];
      A[0] += dx * rx; A[1] += dx * ry; A[2] += dx * rz;
      A[3] += dy * rx; A[4] += dy * ry; A[5] += dy * rz;
      A[6] += dz * rx; A[7] += dz * ry; A[8] += dz * rz;
    }
    extractRotation(A, rg.q, 3, this._R);
    const R = quatToMat(rg.q, this._R), k = rg.k;
    for (let i = rg.lo, o = 0; i < rg.hi; i++, o += 3) {
      const rx = rg.r0[o], ry = rg.r0[o + 1], rz = rg.r0[o + 2];
      x[3 * i] += k * (cx + R[0] * rx + R[1] * ry + R[2] * rz - x[3 * i]);
      x[3 * i + 1] += k * (cy + R[3] * rx + R[4] * ry + R[5] * rz - x[3 * i + 1]);
      x[3 * i + 2] += k * (cz + R[6] * rx + R[7] * ry + R[8] * rz - x[3 * i + 2]);
    }
    rg.c = [cx, cy, cz];
  }

  collide() {
    const { x, prev, crad, n } = this, X = TANK.x - 0.06, Z = TANK.z - 0.06, Y = TANK.top - 0.06;
    for (let i = 0; i < n; i++) {
      const i3 = 3 * i, r = crad[i];
      if (x[i3 + 1] < r) {
        x[i3 + 1] = r;
        x[i3] = prev[i3] + (x[i3] - prev[i3]) * (1 - MU);
        x[i3 + 2] = prev[i3 + 2] + (x[i3 + 2] - prev[i3 + 2]) * (1 - MU);
      }
      if (x[i3 + 1] > Y) x[i3 + 1] = Y;
      x[i3] = clamp(x[i3], -X, X);
      x[i3 + 2] = clamp(x[i3 + 2], -Z, Z);
    }
  }

  checkGrabs() {
    const { x } = this, P = this.params;
    for (const [id, g] of this.grabs) {
      let lag = 0;
      g.idx.forEach((i, q) => {
        lag += g.wt[q] * Math.hypot(x[3 * i] - g.target[0] - g.off[3 * q], x[3 * i + 1] - g.target[1] - g.off[3 * q + 1], x[3 * i + 2] - g.target[2] - g.off[3 * q + 2]);
      });
      g.lag = lag;
      let peel = lag > (g.kind === 'arm' ? 0.3 + 0.4 * P.suction : 0.3);
      if (g.kind === 'arm') { g.stretch = this.armStretch(g.arm); if (g.stretch > 1.5 + 1.1 * P.suction) peel = true; }
      if (peel) { this.grabs.delete(id); this.events.push({ type: 'peel', id, kind: g.kind, arm: g.arm, pos: [...g.target] }); }
    }
  }

  centroid(ring, X = this.x) {
    const c = [0, 0, 0];
    for (const i of ring) for (let d = 0; d < 3; d++) c[d] += X[3 * i + d] / ring.length;
    return c;
  }

  armStretch(k) {
    const A = this.arms[k];
    let L = 0, p = this.centroid(A.rings[0]);
    for (let i = 1; i < A.rings.length; i++) { const c = this.centroid(A.rings[i]); L += len(sub(c, p)); p = c; }
    return L / A.restLen;
  }

  bodyRotation() { return quatToMat(this.regions[0].q, new Float64Array(9)); }

  bodyCenter(X = this.x) {
    const c = [0, 0, 0];
    for (const r of this.rings) for (let d = 0; d < 3; d++) c[d] += X[3 * r.c + d] / this.rings.length;
    return c;
  }

  shadowSpheres(X, out) {
    let k = 0;
    const put = (c, r) => { out[4 * k] = c[0]; out[4 * k + 1] = c[1]; out[4 * k + 2] = c[2]; out[4 * k + 3] = r; k++; };
    for (const rg of this.rings) {
      const c = this.centroid([rg.c], X);
      let r = 0;
      for (const i of rg.o) r += len(sub(this.centroid([i], X), c)) / rg.o.length;
      put(c, 0.92 * r);
    }
    for (const f of this.fins) put(this.centroid(f.flap.map(([i]) => i), X), 0.11);
    for (const A of this.arms) for (let i = 1; i < A.rings.length; i += 2) put(this.centroid(A.rings[i], X), A.rho(i / (A.rings.length - 1)) * 0.62);
    return k;
  }

  minY() { let m = Infinity; for (let i = 1; i < this.x.length; i += 3) m = Math.min(m, this.x[i]); return m; }

  invertedTets() {
    const { x, tets } = this;
    let bad = 0;
    for (let t = 0; t < this.nt; t++) {
      const p = [0, 1, 2, 3].map(q => [x[3 * tets[4 * t + q]], x[3 * tets[4 * t + q] + 1], x[3 * tets[4 * t + q] + 2]]);
      if (dot(cross(sub(p[1], p[0]), sub(p[2], p[0])), sub(p[3], p[0])) <= 0) bad++;
    }
    return bad;
  }

  kinetic() { let e = 0; for (let i = 0; i < this.n; i++) e += 0.5 * this.mass[i] * (this.v[3 * i] ** 2 + this.v[3 * i + 1] ** 2 + this.v[3 * i + 2] ** 2); return e; }
}

const ell = (u, v) => [-Math.cos(PI * u), Math.sin(PI * u) * Math.cos(2 * PI * v), Math.sin(PI * u) * Math.sin(2 * PI * v)];

export function buildSkin(S) {
  const pos = [], restA = [], attr = [], cand = [], tris = [];
  const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
  const bodyT = range(0, S.bodyTetEnd);

  function revolve(nu, nv, f, c) {
    const base = pos.length / 3;
    const push = (u, v) => { const o = f(u, v); pos.push(...o.p); restA.push(...o.r); attr.push(...o.a); cand.push(c); };
    push(0, 0);
    for (let i = 1; i <= nu; i++) for (let j = 0; j < nv; j++) push(i / (nu + 1), j / nv);
    push(1, 0);
    const R = (i, j) => base + 1 + i * nv + (j % nv), last = base + 1 + nu * nv, t0 = tris.length;
    for (let j = 0; j < nv; j++) tris.push(base, R(0, j + 1), R(0, j));
    for (let i = 0; i < nu - 1; i++) for (let j = 0; j < nv; j++) tris.push(R(i, j), R(i, j + 1), R(i + 1, j + 1), R(i, j), R(i + 1, j + 1), R(i + 1, j));
    for (let j = 0; j < nv; j++) tris.push(last, R(nu - 1, j), R(nu - 1, j + 1));
    const P = i => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
    let V = 0;
    for (let t = t0; t < tris.length; t += 3) V += dot(P(tris[t]), cross(P(tris[t + 1]), P(tris[t + 2])));
    if (V < 0) for (let t = t0; t < tris.length; t += 3) [tris[t + 1], tris[t + 2]] = [tris[t + 2], tris[t + 1]];
  }

  revolve(58, 48, (u, v) => {
    const p = bodyPoint(u, 2 * PI * v, 1);
    return { p, r: p, a: [0, u, v, lerp(MATS[MANTLE].k, MATS[HEAD].k, smooth(0.56, 0.68, u))] };
  }, bodyT);
  for (const F of S.fins) {
    const c = range(F.t0, F.t1).concat(bodyT);
    revolve(18, 22, (u, v) => {
      const l = ell(u, v), p = add(F.c, add(mul(F.ax, l[0] * 0.21), add(mul(F.out, l[1] * 0.24), mul(F.nrm, l[2] * 0.028))));
      return { p, r: p, a: [1, u, v, MATS[FIN].k] };
    }, c);
  }
  S.arms.forEach((A, k) => {
    const N = A.pts.length, pt = i => A.pts[clamp(i, 0, N - 1)];
    revolve(A.tent ? 44 : 34, 12, (u, v) => {
      const fi = u * (N - 1), i = Math.min(Math.floor(fi), N - 2), t = fi - i;
      const c = catmull3(pt(i - 1), pt(i), pt(i + 1), pt(i + 2), t);
      const tg = norm(lerp3(A.frames[i].t, A.frames[i + 1].t, t));
      let o = lerp3(A.frames[i].o, A.frames[i + 1].o, t);
      o = norm(sub(o, mul(tg, dot(o, tg))));
      const b = cross(tg, o);
      const pinch = Math.sqrt(smooth(0, 0.07, u)) * (u > 0.9 ? Math.sqrt(Math.max(0, 1 - ((u - 0.9) / 0.1) ** 2)) : 1);
      const r = 0.72 * A.rho(u) * pinch, a = 2 * PI * (v - 0.5);
      const p = add(c, add(mul(o, r * Math.cos(a)), mul(b, r * Math.sin(a))));
      const kk = A.tent ? MATS[TENT].k + 0.2 * Math.exp(-(((u - 0.84) / 0.09) ** 2)) : lerp(0.78, 0.58, u);
      return { p, r: p, a: [2 + k, u, v, kk] };
    }, range(A.t0, A.t1));
  });
  const skinCount = tris.length, skinV = pos.length / 3;
  for (const O of ORGANS) revolve(12, 16, (u, v) => {
    const l = ell(u, v);
    return { p: add(O.c, [l[0] * O.r[0], l[1] * O.r[1], l[2] * O.r[2]]), r: l, a: [O.id, 0, 0, 0] };
  }, bodyT);
  const organCount = tris.length - skinCount, eyeV0 = pos.length / 3;
  for (const E of S.eyes) revolve(22, 32, (u, v) => {
    const l = [Math.sin(PI * u) * Math.cos(2 * PI * v), Math.sin(PI * u) * Math.sin(2 * PI * v), -Math.cos(PI * u)];
    return { p: add(E.c, matVec(E.frame, mul(l, E.r))), r: l, a: [30, E.side, 0, 0] };
  }, null);
  const eyeCount = tris.length - skinCount - organCount, nv = pos.length / 3;

  const inv = new Float64Array(12 * S.nt);
  for (let t = 0; t < S.nt; t++) {
    const p = [0, 1, 2, 3].map(q => [S.rest[3 * S.tets[4 * t + q]], S.rest[3 * S.tets[4 * t + q] + 1], S.rest[3 * S.tets[4 * t + q] + 2]]);
    const [a, b, c] = [sub(p[1], p[0]), sub(p[2], p[0]), sub(p[3], p[0])];
    const bc = cross(b, c), ca = cross(c, a), ab = cross(a, b), det = dot(a, bc);
    inv.set([...p[0], ...mul(bc, 1 / det), ...mul(ca, 1 / det), ...mul(ab, 1 / det)], 12 * t);
  }
  const embed = (p, cands) => {
    let best = cands[0], bs = -Infinity, bb = null;
    for (const t of cands) {
      const o = 12 * t, d = [p[0] - inv[o], p[1] - inv[o + 1], p[2] - inv[o + 2]];
      const l1 = d[0] * inv[o + 3] + d[1] * inv[o + 4] + d[2] * inv[o + 5];
      const l2 = d[0] * inv[o + 6] + d[1] * inv[o + 7] + d[2] * inv[o + 8];
      const l3 = d[0] * inv[o + 9] + d[1] * inv[o + 10] + d[2] * inv[o + 11];
      const b = [1 - l1 - l2 - l3, l1, l2, l3], s = Math.min(...b);
      if (s > bs) { bs = s; best = t; bb = b; }
    }
    return [best, bb];
  };
  const tetOf = new Int32Array(eyeV0), bary = new Float64Array(4 * eyeV0);
  for (let v = 0; v < eyeV0; v++) {
    const [t, b] = embed([pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]], cand[v]);
    tetOf[v] = t; bary.set(b, 4 * v);
  }
  const eyeEmb = S.eyes.map(E => embed(E.c, bodyT));

  const stat = new Float32Array(7 * nv);
  for (let v = 0; v < nv; v++) { stat.set(restA.slice(3 * v, 3 * v + 3), 7 * v); stat.set(attr.slice(4 * v, 4 * v + 4), 7 * v + 3); }
  const index = Uint32Array.from(tris), dyn = new Float32Array(6 * nv), nrm = new Float64Array(3 * eyeV0);
  const eyeLocal = Float64Array.from(restA.slice(3 * eyeV0));

  const at = (X, t, b, d) => {
    let s = 0;
    for (let q = 0; q < 4; q++) s += b[q] * X[3 * S.tets[4 * t + q] + d];
    return s;
  };

  function update(X, R) {
    const T = S.tets;
    for (let v = 0; v < eyeV0; v++) {
      const t = 4 * tetOf[v], b0 = bary[4 * v], b1 = bary[4 * v + 1], b2 = bary[4 * v + 2], b3 = bary[4 * v + 3];
      const i0 = 3 * T[t], i1 = 3 * T[t + 1], i2 = 3 * T[t + 2], i3 = 3 * T[t + 3];
      dyn[6 * v] = b0 * X[i0] + b1 * X[i1] + b2 * X[i2] + b3 * X[i3];
      const y = b0 * X[i0 + 1] + b1 * X[i1 + 1] + b2 * X[i2 + 1] + b3 * X[i3 + 1];
      dyn[6 * v + 1] = v < skinV ? Math.max(y, 0.004) : y;
      dyn[6 * v + 2] = b0 * X[i0 + 2] + b1 * X[i1 + 2] + b2 * X[i2 + 2] + b3 * X[i3 + 2];
    }
    nrm.fill(0);
    const nt = skinCount + organCount;
    for (let t = 0; t < nt; t += 3) {
      const a = index[t], b = index[t + 1], c = index[t + 2];
      const ax = dyn[6 * a], ay = dyn[6 * a + 1], az = dyn[6 * a + 2];
      const ux = dyn[6 * b] - ax, uy = dyn[6 * b + 1] - ay, uz = dyn[6 * b + 2] - az;
      const vx = dyn[6 * c] - ax, vy = dyn[6 * c + 1] - ay, vz = dyn[6 * c + 2] - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const i of [a, b, c]) { nrm[3 * i] += nx; nrm[3 * i + 1] += ny; nrm[3 * i + 2] += nz; }
    }
    for (let v = 0; v < eyeV0; v++) {
      const l = Math.hypot(nrm[3 * v], nrm[3 * v + 1], nrm[3 * v + 2]) || 1;
      dyn[6 * v + 3] = nrm[3 * v] / l; dyn[6 * v + 4] = nrm[3 * v + 1] / l; dyn[6 * v + 5] = nrm[3 * v + 2] / l;
    }
    const per = (nv - eyeV0) / S.eyes.length;
    S.eyes.forEach((E, e) => {
      const [t, b] = eyeEmb[e], c = [0, 1, 2].map(d => at(X, t, b, d));
      for (let v = eyeV0 + e * per; v < eyeV0 + (e + 1) * per; v++) {
        const l = eyeLocal.subarray(3 * (v - eyeV0), 3 * (v - eyeV0) + 3);
        const nn = matVec(R, matVec(E.frame, l));
        for (let d = 0; d < 3; d++) { dyn[6 * v + d] = c[d] + nn[d] * E.r; dyn[6 * v + 3 + d] = nn[d]; }
      }
    });
    return dyn;
  }

  return { nv, dyn, stat, index, skinCount, organCount, eyeCount, eyeV0, skinV, update, eyeCenter: (X, e) => [0, 1, 2].map(d => at(X, ...eyeEmb[e], d)) };
}
