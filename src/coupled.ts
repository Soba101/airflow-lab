import { FluidGrid, RC, RHO } from "./fluid";
import { geometry, part, signature, clone } from "./config";
import { thermalEnergy, thermalStep } from "./thermal";
import type { ThermalNodes } from "./thermal";
import type { SceneConfig, V3, CaseGeometry, Diagnostics, Part } from "./types";
export const fanPressure = (p: Part, rpm: number, q: number) => {
  const ratio = rpm / (p.maxRPM || 2000),
    free = (p.cfm || 60) * 0.00047194745 * ratio;
  if (free <= 0) return 0;
  if (p.curve?.length) {
    const t = q / Math.max(1e-9, free);
    const curve = p.curve;
    let i = 0;
    while (i < curve.length - 2 && curve[i + 1][0] < t) i++;
    const a = curve[i],
      b = curve[i + 1],
      f = Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0])));
    return Math.max(0, (a[1] + f * (b[1] - a[1])) * ratio * ratio);
  }
  return Math.max(0, (p.pressure || 15) * ratio * ratio * (1 - (q / Math.max(1e-9, free)) ** 2));
};
export interface Port {
  id: string;
  inside: V3;
  outside: V3;
  normal: V3;
  size: number;
  intake: boolean;
  rpm: number;
  part: Part | null;
  loss: number;
  q: number;
  cp: [number, number][];
  rp: [number, number][];
}
const plus = (a: V3, b: V3, s = 1) => a.map((v, i) => v + b[i] * s) as V3;
export class CoupledModel {
  c: SceneConfig;
  g: CaseGeometry;
  room: FluidGrid;
  pc: FluidGrid;
  ports: Port[] = [];
  nodes: ThermalNodes;
  time = 0;
  steps = 0;
  energyInput = 0;
  energy0 = 0;
  lastEnergyError = 0;
  lastMass = 0;
  lastHeatError = 0;
  lastIntake = 27;
  lastExhaust = 27;
  lastFlow = 0;
  recent = 0;
  quality: string;
  cpuR: number;
  gpuR: number;
  calibrated = false;
  lastExternal = 0;
  pressure: number = 0;
  constructor(config: SceneConfig, quality = "preview") {
    this.c = clone(config);
    this.g = geometry(config);
    this.quality = quality;
    const base = quality === "fine" ? 36 : quality === "balanced" ? 26 : quality === "draft" ? 20 : 16;
    const ns = (size: V3, n: number): V3 => size.map((s) => Math.max(7, Math.round((s / Math.max(...size)) * n))) as V3;
    this.pc = new FluidGrid(this.g.inner, ns(this.g.inner, base), config.room.ambient, this.g.origin, 0.00012);
    this.room = new FluidGrid(
      config.room.size,
      ns(config.room.size, quality === "preview" ? 14 : quality === "fine" ? 27 : 20),
      config.room.ambient,
      [0, 0, 0],
      0.003,
    );
    for (const k of this.pc.fluid) {
      const p = this.pc.point(k);
      for (const b of this.g.boxes)
        if (p.every((v, i) => v >= b.min[i] && v <= b.min[i] + b.size[i])) {
          if (b.porous) this.pc.drag[k] += b.porous;
          else this.pc.solid[k] = 1;
        }
    }
    this.pc.rebuild();
    const desk = config.desk;
    for (const k of this.room.fluid) {
      const p = this.room.point(k);
      const insidePC = p.every((v, i) => v >= this.g.origin[i] && v <= this.g.origin[i] + this.g.size[i]);
      const tabletop =
        Math.abs(p[0] - desk.position[0]) < desk.width / 2 &&
        Math.abs(p[2] - desk.position[2]) < desk.depth / 2 &&
        Math.abs(p[1] - desk.height) < Math.max(0.0175, this.room.h[1] * 0.3);
      const leg =
        p[1] < desk.height &&
        [-1, 1].some((sx) =>
          [-1, 1].some(
            (sz) =>
              Math.abs(p[0] - (desk.position[0] + sx * (desk.width / 2 - 0.05))) < 0.035 &&
              Math.abs(p[2] - (desk.position[2] + sz * (desk.depth / 2 - 0.05))) < 0.035,
          ),
        );
      if (insidePC || tabletop || leg) this.room.solid[k] = 1;
    }
    this.room.rebuild();
    for (const f of config.fans) {
      const m = this.g.mounts.find((m) => m.id === f.mount);
      if (!m || !f.enabled || f.rpm <= 0) continue;
      const fp = part(config, f.part),
        inside = plus(m.position, m.normal, 0.025),
        outside = plus(plus(this.g.origin, m.position), m.normal, -0.055);
      let loss = 9000;
      if (
        part(config, config.parts.cooler).coolerType === "aio" &&
        (config.radiatorMount === "top" ? f.mount.startsWith("top") : f.mount.startsWith("front"))
      )
        loss += 22000;
      loss += part(config, config.parts.gpu).size[0] * part(config, config.parts.gpu).size[1] * 80000;
      this.ports.push({
        id: f.id,
        inside,
        outside,
        normal: m.normal,
        size: fp.size[0],
        intake: f.intake,
        rpm: f.rpm,
        part: fp,
        loss,
        q: 0,
        cp: this.pc.patch(inside, fp.size[0] * 0.3),
        rp: this.room.patch(outside, Math.max(...this.room.h) * 0.7),
      });
    }
    for (const [id, p] of [
      ["passive-low", [this.g.inner[0] - 0.02, 0.06, 0.1]],
      ["passive-high", [this.g.inner[0] - 0.02, this.g.inner[1] - 0.05, 0.1]],
    ] as [string, V3][]) {
      const n: V3 = [-1, 0, 0],
        outside = plus(plus(this.g.origin, p), n, -0.05);
      this.ports.push({
        id,
        inside: p,
        outside,
        normal: n,
        size: 0.08,
        intake: true,
        rpm: 0,
        part: null,
        loss: config.panelsOpen ? 18000 : 180000,
        q: 0,
        cp: this.pc.patch(p, 0.035),
        rp: this.room.patch(outside, Math.max(...this.room.h) * 0.65),
      });
    }
    const ambient = config.room.ambient;
    this.nodes = { cpu: ambient, sink: ambient, gpu: ambient, gpuSink: ambient };
    const co = part(config, config.parts.cooler),
      gp = part(config, config.parts.gpu);
    this.cpuR = (co.resistance || 0.18) + 0.08;
    this.gpuR = gp.resistance || 0.1;
    const cal = config.calibrations.find((x) => x.id === config.activeCalibration && x.signature === signature(config));
    const rpm =
      config.fans.filter((f) => f.enabled).reduce((a, f) => a + f.rpm, 0) /
      Math.max(1, config.fans.filter((f) => f.enabled).length);
    if (
      cal &&
      Math.abs(cal.ambient - ambient) <= 5 &&
      Math.abs(cal.cpuWatts - config.load.cpu) <= Math.max(15, cal.cpuWatts * 0.25) &&
      Math.abs(cal.gpuWatts - config.load.gpu) <= Math.max(30, cal.gpuWatts * 0.25) &&
      Math.abs(cal.rpm - rpm) <= Math.max(200, cal.rpm * 0.25)
    ) {
      this.calibrated = true;
      this.cpuR = cal.cpuR;
      this.gpuR = cal.gpuR;
    }
    this.energy0 = this.energy();
    this.updatePorts();
  }
  capacities() {
    return [
      part(this.c, this.c.parts.cpu).capacity || 35,
      part(this.c, this.c.parts.cooler).capacity ||
        (part(this.c, this.c.parts.cooler).coolerType === "aio" ? 650 : 450),
      65,
      part(this.c, this.c.parts.gpu).capacity || 1300,
    ];
  }
  energy() {
    return (
      this.room.energy() +
      this.pc.energy() +
      thermalEnergy(
        this.nodes,
        this.c.room.ambient,
        part(this.c, this.c.parts.cooler).coolerType === "aio",
        this.capacities(),
      )
    );
  }
  operating(qp: number, p: Port, roomP: number) {
    const buoy =
      ((RHO * 9.81 * (this.pc.mean() - this.room.mean())) / (273.15 + this.c.room.ambient)) *
      (p.inside[1] - this.g.inner[1] / 2);
    if (!p.part) {
      const delta = roomP - qp + buoy;
      return Math.sign(delta) * Math.sqrt(Math.abs(delta) / p.loss);
    }
    const sign = p.intake ? 1 : -1,
      ratio = p.rpm / (p.part.maxRPM || 2000),
      qmax = (p.part.cfm || 60) * 0.00047194745 * ratio,
      head = (p.part.pressure || 15) * ratio * ratio,
      available = head - sign * (qp - roomP - buoy);
    if (available <= 0) return 0;
    let lo = 0,
      hi = qmax * 1.2;
    for (let i = 0; i < 36; i++) {
      const q = (lo + hi) / 2,
        dp = fanPressure(p.part, p.rpm, q) - p.loss * q * q - sign * (qp - roomP - buoy);
      if (dp > 0) lo = q;
      else hi = q;
    }
    return (sign * (lo + hi)) / 2;
  }
  updatePorts() {
    let lo = -150,
      hi = 150;
    const roomP = this.ports.map((p) => this.room.avg(p.rp, this.room.p));
    for (let iter = 0; iter < 45; iter++) {
      const pressure = (lo + hi) / 2,
        total = this.ports.reduce((a, p, i) => a + this.operating(pressure, p, roomP[i]), 0);
      if (total > 0) lo = pressure;
      else hi = pressure;
    }
    this.pressure = (lo + hi) / 2;
    this.pc.source.fill(0);
    this.room.source.fill(0);
    this.pc.au.fill(0);
    this.pc.av.fill(0);
    this.pc.aw.fill(0);
    this.room.au.fill(0);
    this.room.av.fill(0);
    this.room.aw.fill(0);
    for (const [p, i] of this.ports.map((p, i) => [p, i] as const)) {
      p.q = this.operating(this.pressure, p, roomP[i]);
      this.pc.addVolume(p.cp, p.q);
      this.room.addVolume(p.rp, -p.q);
      const dir = p.normal.map((v) => v * Math.sign(p.q)) as V3;
      this.pc.jet(p.inside, dir, (Math.abs(p.q) / (0.004 + p.size * p.size)) * 5, p.size * 0.35);
      if (p.q < 0) this.room.jet(p.outside, dir, (Math.abs(p.q) / (0.004 + p.size * p.size)) * 2, p.size * 0.5);
    }
    const gp = part(this.c, this.c.parts.gpu),
      gpuDir: V3 = [0, 1, 0];
    this.pc.jet(plus(this.g.gpu, [0, -0.045, 0]), gpuDir, 0.7 * (0.5 + this.c.load.gpu / 500), 0.05);
    if (part(this.c, this.c.parts.cooler).coolerType === "air") this.pc.jet(this.g.cpu, [-1, 0, 0], 0.5, 0.045);
    this.lastMass = Math.abs(this.ports.reduce((a, p) => a + p.q, 0));
  }
  makeTerms() {
    const terms = (g: FluidGrid) => ({
        supply: new Float64Array(g.count),
        sink: new Float64Array(g.count),
        heat: new Float64Array(g.count),
        tag: new Float64Array(g.count),
      }),
      pc = terms(this.pc),
      room = terms(this.room);
    let intake = 0,
      exhaust = 0,
      qi = 0,
      qo = 0,
      recent = 0;
    const add = (
      g: FluidGrid,
      t: ReturnType<typeof terms>,
      patch: [number, number][],
      q: number,
      temp: number,
      tag: number,
    ) => {
      for (const [k, w] of patch) {
        if (q > 0) {
          t.supply[k] += ((q * w) / g.vol) * temp;
          t.tag[k] += ((q * w) / g.vol) * tag;
        } else t.sink[k] += (-q * w) / g.vol;
      }
    };
    for (const p of this.ports) {
      const tc = this.pc.avg(p.cp),
        tr = this.room.avg(p.rp),
        tag = this.room.avg(p.rp, this.room.tag);
      if (p.q >= 0) {
        add(this.pc, pc, p.cp, p.q, tr, tag);
        add(this.room, room, p.rp, -p.q, tr, tag);
        intake += p.q * tr;
        qi += p.q;
        recent += p.q * tag;
      } else {
        add(this.pc, pc, p.cp, p.q, tc, 1);
        add(this.room, room, p.rp, -p.q, tc, 1);
        exhaust += -p.q * tc;
        qo -= p.q;
      }
    }
    this.lastIntake = qi ? intake / qi : this.room.mean();
    this.lastExhaust = qo ? exhaust / qo : this.pc.mean();
    this.lastFlow = qi;
    this.recent = qi ? recent / qi : 0; // Integrate the assembled interface terms independently on both grids.
    const power = (g: FluidGrid, t: ReturnType<typeof terms>) =>
      g.fluid.reduce((sum, k) => sum + RC * g.vol * (t.supply[k] - t.sink[k] * g.T[k]), 0);
    this.lastHeatError = power(this.pc, pc) + power(this.room, room);
    const cpuPatch = this.pc.patch(this.g.radiator, 0.05),
      gpuPatch = this.pc.patch(plus(this.g.gpu, [0, -0.045, 0]), 0.05);
    return { pc, room, add, cpuPatch, gpuPatch };
  }
  async prepare(maxDt = 0.08, projector?: { project: (g: FluidGrid) => Promise<void> }) {
    if (this.steps % 8 === 0) this.updatePorts();
    this.pc.source.fill(0);
    this.room.source.fill(0);
    for (const p of this.ports) {
      this.pc.addVolume(p.cp, p.q);
      this.room.addVolume(p.rp, -p.q);
    }
    const terms = this.makeTerms();
    const forceDt = Math.min(maxDt, 0.025, this.pc.stableDt(terms.pc.sink), this.room.stableDt(terms.room.sink));
    this.pc.forces(forceDt);
    this.room.forces(forceDt);
    if (projector && this.steps % 3 === 0) {
      await projector.project(this.pc);
      await projector.project(this.room);
    } else {
      this.pc.project(this.quality === "preview" ? 45 : 100);
      this.room.project(this.quality === "preview" ? 45 : 100);
    }
    const { room, add } = terms;
    let ventExternal = 0;
    const opened = this.c.room.openings.filter((o) => o.open > 0),
      sumOpen = opened.reduce((a, o) => a + o.open, 0),
      qVent =
        ((this.c.room.exchange * (this.room.fluid.length * this.room.vol)) / 3600) *
        (this.c.room.openings.length ? sumOpen / this.c.room.openings.length : 0);
    const windows = opened.filter((o) => o.type === "window"),
      doors = opened.filter((o) => o.type === "door"),
      ins = windows.length ? windows : doors,
      outs = doors.length ? doors : windows;
    const openingPoint = (o: (typeof opened)[0], offset: number): V3 => {
      const [rw, rh, rd] = this.c.room.size,
        along = o.along * (["left", "right"].includes(o.wall) ? rd : rw) + offset,
        y = o.sill + o.height / 2;
      return o.wall === "left"
        ? [this.room.h[0] * 0.6, y, along]
        : o.wall === "right"
          ? [rw - this.room.h[0] * 0.6, y, along]
          : o.wall === "front"
            ? [along, y, rd - this.room.h[2] * 0.6]
            : [along, y, this.room.h[2] * 0.6];
    };
    if (ins.length && outs.length) {
      for (const [list, sign] of [
        [ins, 1],
        [outs, -1],
      ] as const) {
        const weights = list.reduce((a, o) => a + o.width * o.height * o.open, 0);
        for (const o of list) {
          const q = (qVent * o.width * o.height * o.open) / weights,
            patch = this.room.patch(openingPoint(o, ins === outs ? sign * 0.2 : 0), Math.max(...this.room.h) * 0.7),
            temp = o.type === "window" ? this.c.room.outside : this.c.room.adjacent;
          this.room.addVolume(patch, sign * q);
          add(this.room, room, patch, sign * q, temp, 0);
          ventExternal += sign > 0 ? RC * q * temp : -RC * q * this.room.avg(patch);
        }
      } // Project again because these volume sources are included in the velocity field.
      const before = this.room.p.slice();
      this.room.project(this.quality === "preview" ? 50 : 100);
      for (const k of this.room.fluid) this.room.p[k] += before[k];
    }

    const dt = Math.min(forceDt, this.pc.stableDt(terms.pc.sink, maxDt), this.room.stableDt(terms.room.sink, maxDt));
    return { dt, terms, ventExternal };
  }
  commit(prepared: Awaited<ReturnType<CoupledModel["prepare"]>>, dt = prepared.dt) {
    if (dt > prepared.dt + 1e-12) throw new Error("Unsafe shared timestep");
    const { terms } = prepared;
    const { pc, room, cpuPatch, gpuPatch } = terms;
    const flow = Math.max(0.4, Math.min(2.5, Math.sqrt(Math.max(0.0001, this.lastFlow) / 0.035))),
      thermal = thermalStep(
        this.nodes,
        dt,
        this.c.load.cpu,
        this.c.load.gpu,
        this.pc.avg(cpuPatch),
        this.pc.avg(gpuPatch),
        this.cpuR,
        this.gpuR,
        flow,
        part(this.c, this.c.parts.cooler).coolerType === "aio",
        this.capacities(),
      );
    for (const [k, w] of cpuPatch) pc.heat[k] += thermal.cpuToAir * w;
    for (const [k, w] of gpuPatch) pc.heat[k] += thermal.gpuToAir * w;
    for (const k of this.pc.fluid) pc.heat[k] += this.c.load.other / this.pc.fluid.length;
    // Conductive case-to-room exchange is equal and opposite.
    const panel = this.room.patch(
        plus(this.g.origin, [this.g.size[0] / 2, this.g.size[1] / 2, -0.03]),
        Math.max(...this.room.h),
      ),
      qPanel = 1.5 * (this.pc.mean() - this.room.avg(panel));
    for (const k of this.pc.fluid) pc.heat[k] -= qPanel / this.pc.fluid.length;
    for (const [k, w] of panel) room.heat[k] += qPanel * w;
    let external = prepared.ventExternal;
    for (const k of this.room.fluid) {
      const watts = (this.c.room.wallUA / this.room.fluid.length) * (this.c.room.outside - this.room.T[k]);
      room.heat[k] += watts;
      external += watts;
    }
    this.pc.transport(dt, pc.supply, pc.sink, pc.heat, pc.tag, 0);
    this.room.transport(dt, room.supply, room.sink, room.heat, room.tag, 0.03);
    this.time += dt;
    this.steps++;
    this.energyInput += dt * (this.c.load.cpu + this.c.load.gpu + this.c.load.other + external);
    this.lastExternal = external;
    this.lastEnergyError = this.energy() - this.energy0 - this.energyInput;
    return dt;
  }
  async step(maxDt = 0.08, projector?: { project: (g: FluidGrid) => Promise<void> }) {
    const prepared = await this.prepare(maxDt, projector);
    return this.commit(prepared);
  }
  diagnostics(): Diagnostics {
    return {
      divergence: Math.max(this.pc.divergence, this.room.divergence),
      pressureResidual: Math.max(this.pc.pressureResidual, this.room.pressureResidual),
      massError: this.lastMass,
      energyError: this.lastEnergyError,
      couplingError: this.lastHeatError,
      cpu:
        this.pc.avg(this.pc.patch(this.g.radiator, 0.05)) +
        (this.c.load.cpu * this.cpuR) /
          Math.max(0.4, Math.min(2.5, Math.sqrt(Math.max(0.0001, this.lastFlow) / 0.035))),
      gpu:
        this.pc.avg(this.pc.patch(plus(this.g.gpu, [0, -0.045, 0]), 0.05)) +
        (this.c.load.gpu * this.gpuR) /
          Math.max(0.4, Math.min(2.5, Math.sqrt(Math.max(0.0001, this.lastFlow) / 0.035))),
      cpuTransient: this.nodes.cpu,
      gpuTransient: this.nodes.gpu,
      coolant: this.nodes.sink,
      room: this.room.mean(),
      intake: this.lastIntake,
      exhaust: this.lastExhaust,
      flow: this.lastFlow,
      recirculation: this.recent,
      time: this.time,
      steps: this.steps,
      calibrated: this.calibrated,
      fanFlows: this.ports.map((p) => ({
        id: p.id,
        q: p.q,
        pa: p.part ? fanPressure(p.part, p.rpm, Math.abs(p.q)) : 0,
      })),
    };
  }
}
