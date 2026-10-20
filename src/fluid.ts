import type { V3, Field } from "./types";
export const RHO = 1.2,
  CP = 1005,
  RC = RHO * CP;
export class FluidGrid {
  n: V3;
  size: V3;
  h: V3;
  count: number;
  vol: number;
  origin: V3;
  T: Float64Array;
  tag: Float64Array;
  p: Float64Array;
  solid: Uint8Array;
  drag: Float64Array;
  source: Float64Array;
  u: Float64Array;
  v: Float64Array;
  w: Float64Array;
  au: Float64Array;
  av: Float64Array;
  aw: Float64Array;
  neighbors: Int32Array;
  weights: Float64Array;
  diag: Float64Array;
  fluid: number[] = [];
  pressureResidual = 0;
  divergence = 0;
  pressureDt = 0.025;
  ambient: number;
  diffusivity: number;
  time = 0;
  constructor(size: V3, n: V3, ambient = 27, origin: V3 = [0, 0, 0], diffusivity = 0.0005) {
    this.n = n;
    this.size = size;
    this.h = size.map((s, i) => s / n[i]) as V3;
    this.count = n[0] * n[1] * n[2];
    this.vol = this.h[0] * this.h[1] * this.h[2];
    this.origin = origin;
    this.ambient = ambient;
    this.diffusivity = diffusivity;
    this.T = new Float64Array(this.count).fill(ambient);
    this.tag = new Float64Array(this.count);
    this.p = new Float64Array(this.count);
    this.solid = new Uint8Array(this.count);
    this.drag = new Float64Array(this.count);
    this.source = new Float64Array(this.count);
    this.u = new Float64Array((n[0] + 1) * n[1] * n[2]);
    this.v = new Float64Array(n[0] * (n[1] + 1) * n[2]);
    this.w = new Float64Array(n[0] * n[1] * (n[2] + 1));
    this.au = new Float64Array(this.u.length);
    this.av = new Float64Array(this.v.length);
    this.aw = new Float64Array(this.w.length);
    this.neighbors = new Int32Array(this.count * 6).fill(-1);
    this.weights = new Float64Array(6);
    this.diag = new Float64Array(this.count);
    this.rebuild();
  }
  id(x: number, y: number, z: number) {
    return x + this.n[0] * (y + this.n[1] * z);
  }
  uid(x: number, y: number, z: number) {
    return x + (this.n[0] + 1) * (y + this.n[1] * z);
  }
  vid(x: number, y: number, z: number) {
    return x + this.n[0] * (y + (this.n[1] + 1) * z);
  }
  wid(x: number, y: number, z: number) {
    return x + this.n[0] * (y + this.n[1] * z);
  }
  xyz(k: number): V3 {
    return [k % this.n[0], Math.floor(k / this.n[0]) % this.n[1], Math.floor(k / (this.n[0] * this.n[1]))];
  }
  point(k: number): V3 {
    return this.xyz(k).map((v, i) => (v + 0.5) * this.h[i]) as V3;
  }
  rebuild() {
    const [nx, ny, nz] = this.n;
    this.fluid = [];
    this.neighbors.fill(-1);
    this.diag.fill(0);
    this.weights.set([
      1 / this.h[0] ** 2,
      1 / this.h[0] ** 2,
      1 / this.h[1] ** 2,
      1 / this.h[1] ** 2,
      1 / this.h[2] ** 2,
      1 / this.h[2] ** 2,
    ]);
    for (let z = 0; z < nz; z++)
      for (let y = 0; y < ny; y++)
        for (let x = 0; x < nx; x++) {
          const k = this.id(x, y, z);
          if (this.solid[k]) continue;
          this.fluid.push(k);
          const ns = [
            x > 0 ? k - 1 : -1,
            x < nx - 1 ? k + 1 : -1,
            y > 0 ? k - nx : -1,
            y < ny - 1 ? k + nx : -1,
            z > 0 ? k - nx * ny : -1,
            z < nz - 1 ? k + nx * ny : -1,
          ];
          for (let a = 0; a < 6; a++)
            if (ns[a] >= 0 && !this.solid[ns[a]]) {
              this.neighbors[k * 6 + a] = ns[a];
              this.diag[k] += this.weights[a];
            }
        }
  }
  patch(point: V3, r = Math.max(...this.h) * 1.2): [number, number][] {
    let sum = 0,
      out: [number, number][] = [],
      best = 0,
      dist = Infinity;
    for (const k of this.fluid) {
      const p = this.point(k),
        d = p.reduce((a, v, i) => a + (v - point[i]) ** 2, 0);
      if (d < dist) {
        dist = d;
        best = k;
      }
      if (d < r * r * 2.5) {
        const w = Math.exp(-d / (r * r * 0.5));
        out.push([k, w]);
        sum += w;
      }
    }
    return sum ? out.map(([k, w]) => [k, w / sum]) : [[best, 1]];
  }
  avg(patch: [number, number][], array: ArrayLike<number> = this.T) {
    return patch.reduce((a, [k, w]) => a + array[k] * w, 0);
  }
  addVolume(patch: [number, number][], q: number) {
    for (const [k, w] of patch) this.source[k] += (q * w) / this.vol;
  }
  applyA(input: Float64Array, out: Float64Array) {
    for (const k of this.fluid) {
      let a = this.diag[k] * input[k];
      for (let d = 0; d < 6; d++) {
        const j = this.neighbors[k * 6 + d];
        if (j >= 0) a -= this.weights[d] * input[j];
      }
      out[k] = a;
    }
  }
  rhs() {
    const out = new Float64Array(this.count);
    for (const k of this.fluid) {
      const [x, y, z] = this.xyz(k);
      const div =
        (this.u[this.uid(x + 1, y, z)] - this.u[this.uid(x, y, z)]) / this.h[0] +
        (this.v[this.vid(x, y + 1, z)] - this.v[this.vid(x, y, z)]) / this.h[1] +
        (this.w[this.wid(x, y, z + 1)] - this.w[this.wid(x, y, z)]) / this.h[2];
      out[k] = this.source[k] - div;
    }
    return out;
  }
  project(iterations = 100, tolerance = 1e-6) {
    const b = this.rhs(),
      r = b.slice(),
      z = new Float64Array(this.count),
      d = new Float64Array(this.count),
      ad = new Float64Array(this.count),
      p = new Float64Array(this.count);
    let rz = 0;
    const mean = this.fluid.reduce((a, k) => a + b[k], 0) / this.fluid.length;
    for (const k of this.fluid) {
      r[k] -= mean;
      z[k] = r[k] / (this.diag[k] || 1);
      d[k] = z[k];
      rz += r[k] * z[k];
    }
    for (let iter = 0; iter < iterations && rz > 1e-24; iter++) {
      this.applyA(d, ad);
      let dad = 0;
      for (const k of this.fluid) dad += d[k] * ad[k];
      if (dad <= 1e-25) break;
      const alpha = rz / dad;
      let next = 0,
        max = 0;
      for (const k of this.fluid) {
        p[k] += alpha * d[k];
        r[k] -= alpha * ad[k];
        z[k] = r[k] / (this.diag[k] || 1);
        next += r[k] * z[k];
        max = Math.max(max, Math.abs(r[k]));
      }
      if (max < tolerance) break;
      const beta = next / rz;
      for (const k of this.fluid) d[k] = z[k] + beta * d[k];
      rz = next;
    }
    this.correct(p);
    return p;
  }
  correct(p: ArrayLike<number>) {
    const [nx, ny, nz] = this.n,
      [dx, dy, dz] = this.h;
    for (let z = 0; z < nz; z++)
      for (let y = 0; y < ny; y++)
        for (let x = 1; x < nx; x++) {
          const a = this.id(x - 1, y, z),
            b = a + 1;
          if (!this.solid[a] && !this.solid[b]) this.u[this.uid(x, y, z)] -= (p[b] - p[a]) / dx;
          else this.u[this.uid(x, y, z)] = 0;
        }
    for (let z = 0; z < nz; z++)
      for (let y = 1; y < ny; y++)
        for (let x = 0; x < nx; x++) {
          const a = this.id(x, y - 1, z),
            b = a + nx;
          if (!this.solid[a] && !this.solid[b]) this.v[this.vid(x, y, z)] -= (p[b] - p[a]) / dy;
          else this.v[this.vid(x, y, z)] = 0;
        }
    for (let z = 1; z < nz; z++)
      for (let y = 0; y < ny; y++)
        for (let x = 0; x < nx; x++) {
          const a = this.id(x, y, z - 1),
            b = a + nx * ny;
          if (!this.solid[a] && !this.solid[b]) this.w[this.wid(x, y, z)] -= (p[b] - p[a]) / dz;
          else this.w[this.wid(x, y, z)] = 0;
        }
    for (const k of this.fluid) this.p[k] = (p[k] * RHO) / this.pressureDt;
    const residual = this.rhs();
    this.divergence = 0;
    let ss = 0;
    for (const k of this.fluid) {
      this.divergence = Math.max(this.divergence, Math.abs(residual[k]));
      ss += residual[k] ** 2;
    }
    this.pressureResidual = Math.sqrt(ss / this.fluid.length);
  }
  sample(p: V3) {
    const [x, y, z] = p.map((v, i) => Math.max(0, Math.min(this.n[i] - 1, Math.floor(v / this.h[i]))));
    const k = this.id(x, y, z);
    return {
      v: [
        (this.u[this.uid(x, y, z)] + this.u[this.uid(x + 1, y, z)]) / 2,
        (this.v[this.vid(x, y, z)] + this.v[this.vid(x, y + 1, z)]) / 2,
        (this.w[this.wid(x, y, z)] + this.w[this.wid(x, y, z + 1)]) / 2,
      ] as V3,
      t: this.T[k],
      p: this.p[k],
      solid: !!this.solid[k],
      tag: this.tag[k],
    };
  }
  // Semi-Lagrangian momentum advection on staggered faces; bounded explicit viscosity.
  momentum(dt: number) {
    const arrays = [this.u, this.v, this.w],
      old = arrays.map((a) => a.slice()),
      nu = 0.000015;
    const interpolate = (axis: number, p: number[]) => {
      const dims = this.n.map((n, i) => n + (i === axis ? 1 : 0)),
        q = p.map((v, i) => Math.max(0, Math.min(dims[i] - 1, v / this.h[i] - (i === axis ? 0 : 0.5)))),
        lo = q.map(Math.floor);
      let sum = 0;
      for (let z = 0; z < 2; z++)
        for (let y = 0; y < 2; y++)
          for (let x = 0; x < 2; x++) {
            const bits = [x, y, z],
              at = lo.map((v, i) => Math.min(dims[i] - 1, v + bits[i])),
              w = bits.reduce((a, b, i) => a * (b ? q[i] - lo[i] : 1 - q[i] + lo[i]), 1);
            sum += w * old[axis][at[0] + dims[0] * (at[1] + dims[1] * at[2])];
          }
      return sum;
    };
    for (let axis = 0; axis < 3; axis++) {
      const dims = this.n.map((n, i) => n + (i === axis ? 1 : 0));
      for (let z = 0; z < dims[2]; z++)
        for (let y = 0; y < dims[1]; y++)
          for (let x = 0; x < dims[0]; x++) {
            const at = [x, y, z],
              k = x + dims[0] * (y + dims[1] * z);
            if (at[axis] === 0 || at[axis] === dims[axis] - 1) {
              arrays[axis][k] = 0;
              continue;
            }
            const cellA = [...at];
            cellA[axis]--;
            const a = this.id(...(cellA as V3)),
              b = this.id(...(at as V3));
            if (this.solid[a] || this.solid[b]) {
              arrays[axis][k] = 0;
              continue;
            }
            const p = at.map((v, i) => (v + (axis === i ? 0 : 0.5)) * this.h[i]),
              vel = [0, 1, 2].map((i) => interpolate(i, p)),
              back = p.map((v, i) => v - dt * vel[i]);
            let lap = 0;
            for (let d = 0; d < 3; d++) {
              const stride = d === 0 ? 1 : d === 1 ? dims[0] : dims[0] * dims[1],
                left = at[d] > 0 ? old[axis][k - stride] : 0,
                right = at[d] < dims[d] - 1 ? old[axis][k + stride] : 0;
              lap += (left + right - 2 * old[axis][k]) / this.h[d] ** 2;
            }
            arrays[axis][k] = interpolate(axis, back) + dt * nu * lap;
          }
    }
  }
  forces(dt: number) {
    this.momentum(dt);
    this.pressureDt = dt;
    const [nx, ny, nz] = this.n;
    const dragCell = (a: number, b: number) => 1 / (1 + dt * (0.6 + (this.drag[a] + this.drag[b]) / 2));
    for (let z = 0; z < nz; z++)
      for (let y = 0; y < ny; y++)
        for (let x = 1; x < nx; x++) {
          const a = this.id(x - 1, y, z),
            b = a + 1,
            k = this.uid(x, y, z);
          if (!this.solid[a] && !this.solid[b]) this.u[k] = (this.u[k] + this.au[k] * dt) * dragCell(a, b);
          else this.u[k] = 0;
        }
    for (let z = 0; z < nz; z++)
      for (let y = 1; y < ny; y++)
        for (let x = 0; x < nx; x++) {
          const a = this.id(x, y - 1, z),
            b = a + nx,
            k = this.vid(x, y, z);
          if (!this.solid[a] && !this.solid[b])
            this.v[k] =
              (this.v[k] +
                (this.av[k] + (9.81 * (0.5 * (this.T[a] + this.T[b]) - this.ambient)) / (273.15 + this.ambient)) * dt) *
              dragCell(a, b);
          else this.v[k] = 0;
        }
    for (let z = 1; z < nz; z++)
      for (let y = 0; y < ny; y++)
        for (let x = 0; x < nx; x++) {
          const a = this.id(x, y, z - 1),
            b = a + nx * ny,
            k = this.wid(x, y, z);
          if (!this.solid[a] && !this.solid[b]) this.w[k] = (this.w[k] + this.aw[k] * dt) * dragCell(a, b);
          else this.w[k] = 0;
        }
  }
  jet(p: V3, dir: V3, strength: number, radius: number) {
    const add = (arr: Float64Array, axis: number) => {
      const dims = [...this.n];
      dims[axis]++;
      for (let z = 1; z < dims[2] - 1; z++)
        for (let y = 1; y < dims[1] - 1; y++)
          for (let x = 1; x < dims[0] - 1; x++) {
            const loc = [x, y, z].map((v, i) => (v + (axis === i ? 0 : 0.5)) * this.h[i]),
              delta = loc.map((v, i) => v - p[i]),
              along = delta.reduce((a, v, i) => a + v * dir[i], 0);
            if (along < -0.03 || along > radius * 5) continue;
            const cross = delta.reduce((a, v) => a + v * v, 0) - along * along,
              w = radius + Math.max(0, along) * 0.22;
            const value =
              strength * dir[axis] * Math.exp(-cross / (w * w)) * Math.exp(-Math.max(0, along) / (radius * 3));
            const id = axis === 0 ? this.uid(x, y, z) : axis === 1 ? this.vid(x, y, z) : this.wid(x, y, z);
            arr[id] += value;
          }
    };
    if (strength) {
      add(this.au, 0);
      add(this.av, 1);
      add(this.aw, 2);
    }
  }
  stableDt(sink: Float64Array, max = 0.08) {
    let rate = 0;
    const [nx] = this.n,
      [dx, dy, dz] = this.h;
    for (const k of this.fluid) {
      const [x, y, z] = this.xyz(k);
      const r =
        (Math.max(0, -this.u[this.uid(x, y, z)]) + Math.max(0, this.u[this.uid(x + 1, y, z)])) / dx +
        (Math.max(0, -this.v[this.vid(x, y, z)]) + Math.max(0, this.v[this.vid(x, y + 1, z)])) / dy +
        (Math.max(0, -this.w[this.wid(x, y, z)]) + Math.max(0, this.w[this.wid(x, y, z + 1)])) / dz +
        sink[k] +
        2 * this.diffusivity * (1 / dx ** 2 + 1 / dy ** 2 + 1 / dz ** 2);
      rate = Math.max(rate, r);
    }
    return Math.min(max, 0.6 / Math.max(0.01, rate));
  }
  transport(
    dt: number,
    supply: Float64Array,
    sink: Float64Array,
    heat: Float64Array,
    tagSupply: Float64Array,
    decay = 0,
  ) {
    const dT = new Float64Array(this.count),
      dC = new Float64Array(this.count),
      [nx, ny, nz] = this.n;
    const transfer = (a: number, b: number, v: number, h: number) => {
      if (this.solid[a] || this.solid[b]) return;
      const flux = (v * (v >= 0 ? this.T[a] : this.T[b])) / h + (this.diffusivity * (this.T[a] - this.T[b])) / h ** 2,
        fc = (v * (v >= 0 ? this.tag[a] : this.tag[b])) / h + (this.diffusivity * (this.tag[a] - this.tag[b])) / h ** 2;
      dT[a] -= flux;
      dT[b] += flux;
      dC[a] -= fc;
      dC[b] += fc;
    };
    for (let z = 0; z < nz; z++)
      for (let y = 0; y < ny; y++)
        for (let x = 1; x < nx; x++) {
          const a = this.id(x - 1, y, z);
          transfer(a, a + 1, this.u[this.uid(x, y, z)], this.h[0]);
        }
    for (let z = 0; z < nz; z++)
      for (let y = 1; y < ny; y++)
        for (let x = 0; x < nx; x++) {
          const a = this.id(x, y - 1, z);
          transfer(a, a + nx, this.v[this.vid(x, y, z)], this.h[1]);
        }
    for (let z = 1; z < nz; z++)
      for (let y = 0; y < ny; y++)
        for (let x = 0; x < nx; x++) {
          const a = this.id(x, y, z - 1);
          transfer(a, a + nx * ny, this.w[this.wid(x, y, z)], this.h[2]);
        }
    for (const k of this.fluid) {
      this.T[k] += dt * (dT[k] + supply[k] - sink[k] * this.T[k] + heat[k] / (RC * this.vol));
      this.tag[k] = Math.max(
        0,
        Math.min(1, this.tag[k] + dt * (dC[k] + tagSupply[k] - sink[k] * this.tag[k] - decay * this.tag[k])),
      );
    }
    this.time += dt;
  }
  energy() {
    return this.fluid.reduce((a, k) => a + (this.T[k] - this.ambient) * RC * this.vol, 0);
  }
  mean() {
    return this.fluid.reduce((a, k) => a + this.T[k], 0) / this.fluid.length;
  }
  field(): Field {
    const velocity = new Float32Array(this.count * 3);
    for (const k of this.fluid) {
      const p = this.sample(this.point(k));
      velocity.set(p.v, k * 3);
    }
    return {
      n: this.n,
      size: this.size,
      origin: this.origin,
      velocity,
      temperature: Float32Array.from(this.T),
      pressure: Float32Array.from(this.p),
      solid: this.solid.slice(),
    };
  }
}
