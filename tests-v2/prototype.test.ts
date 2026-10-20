import test from "node:test";
import assert from "node:assert/strict";
import { FluidGrid, RC } from "../src/fluid";
import { CoupledModel, fanPressure } from "../src/coupled";
import { preset, geometry, signature, normalize, loadScene, issues } from "../src/config";
import { catalogue } from "../src/catalog";
import { thermalStep, thermalEnergy } from "../src/thermal";
test("3D projection conserves prescribed volume and blocks solid faces", () => {
  const g = new FluidGrid([1, 1, 1], [9, 8, 7]);
  g.solid[g.id(4, 4, 3)] = 1;
  g.rebuild();
  g.addVolume(g.patch([0.2, 0.3, 0.5]), 0.02);
  g.addVolume(g.patch([0.8, 0.7, 0.5]), -0.02);
  g.project(300, 1e-8);
  assert.ok(g.divergence < 1e-6, `${g.divergence}`);
  assert.equal(g.u[g.uid(4, 4, 3)], 0);
  assert.equal(g.u[g.uid(5, 4, 3)], 0);
});
test("3D conservative heat transport keeps closed-domain energy", () => {
  const g = new FluidGrid([1, 1, 1], [8, 8, 8]);
  g.T[g.id(3, 3, 3)] = 50;
  const e = g.energy(),
    zero = new Float64Array(g.count);
  for (let i = 0; i < 100; i++) g.transport(0.1, zero, zero, zero, zero);
  assert.ok(Math.abs(g.energy() - e) < 1e-7);
});
test("buoyancy changes the calculated vertical velocity for warmer air", () => {
  const g = new FluidGrid([1, 1, 1], [8, 8, 8]);
  g.T[g.id(4, 3, 4)] = 40;
  g.forces(0.02);
  g.project(200);
  assert.ok(g.v[g.vid(4, 4, 4)] > 0);
});
test("thermal network preserves input watts across storage and air transfer", () => {
  const n = { cpu: 27, sink: 27, gpu: 27, gpuSink: 27 };
  let out = 0;
  for (let i = 0; i < 1000; i++) {
    const q = thermalStep(n, 0.02, 75, 450, 27, 27, 0.2, 0.1);
    out += (q.cpuToAir + q.gpuToAir) * 0.02;
  }
  assert.ok(Math.abs(thermalEnergy(n, 27) + out - 525 * 20) < 1e-6);
  assert.ok(n.gpu > n.gpuSink);
});
test("fan model follows RPM affinity and curve pressure drop", () => {
  const p = catalogue.find((p) => p.id === "p14")!;
  assert.equal(fanPressure(p, 0, 0), 0);
  assert.ok(Math.abs(fanPressure(p, 1250, 0) * 4 - fanPressure(p, 2500, 0)) < 1e-8);
  assert.ok(fanPressure(p, 2500, 0.02) < fanPressure(p, 2500, 0));
});
test("coupled prototype exchanges equal mass and preserves heat", async () => {
  const c = preset();
  c.room.exchange = 0;
  c.room.wallUA = 0;
  const m = new CoupledModel(c);
  for (let i = 0; i < 12; i++) await m.step();
  const s = m.diagnostics();
  assert.ok(s.massError < 1e-8);
  assert.ok(Math.abs(s.energyError) < 1e-5, `${s.energyError}`);
  assert.ok(s.flow > 0);
  assert.ok(s.gpu > 27);
});
test("GPU, cooler and fan choices alter the numerical scene and flow", async () => {
  const a = preset(),
    b = preset();
  b.parts.gpu = "4080";
  b.parts.cooler = "u12a";
  const x = new CoupledModel(a),
    y = new CoupledModel(b);
  assert.notEqual(
    x.pc.solid.reduce((a, b) => a + b, 0),
    y.pc.solid.reduce((a, b) => a + b, 0),
  );
  assert.notEqual(x.ports[0].q, y.ports[0].q);
  a.fans[0].intake = false;
  const z = new CoupledModel(a);
  assert.notEqual(z.ports[0].q, x.ports[0].q);
});
test("mount conflicts are reported and never auto-rearranged", () => {
  const c = preset();
  c.parts.case = "4000d";
  const before = c.fans[0].mount;
  assert.ok(issues(c).some((x) => x.includes("not available")));
  assert.equal(c.fans[0].mount, before);
});
test("above/below desk and room openings enter 3D physical geometry", () => {
  const a = preset(),
    b = preset();
  b.pc.placement = "underRight";
  const x = new CoupledModel(a),
    y = new CoupledModel(b);
  assert.notEqual(x.g.origin[1], y.g.origin[1]);
  assert.notDeepEqual(x.room.solid, y.room.solid);
  assert.equal(geometry(a).size[0], 0.415);
});
test("scene version and custom dimensions are validated; preset migration works", () => {
  assert.throws(() => normalize({ version: 99 }));
  const migrated = loadScene({
    getItem: (k) => (k === "airflow-room-v1" ? JSON.stringify({ initial: 30, width: 5 }) : null),
  });
  assert.equal(migrated.room.ambient, 30);
  assert.equal(migrated.room.size[0], 5);
  const c = preset();
  c.custom.bad = { ...catalogue[0], id: "bad", size: [-1, 1, 1] };
  assert.throws(() => normalize(c));
});
test("calibration is isolated to hardware and workload range", () => {
  const c = preset();
  c.calibrations = [
    {
      id: "a",
      signature: signature(c),
      ambient: 27,
      cpuWatts: 75,
      gpuWatts: 450,
      rpm: 1150,
      cpuTemp: 60,
      gpuTemp: 75,
      cpuR: 0.44,
      gpuR: 0.107,
      created: "2026-10-21",
    },
  ];
  c.activeCalibration = "a";
  assert.ok(new CoupledModel(c).calibrated);
  c.parts.gpu = "4080";
  assert.equal(new CoupledModel(c).calibrated, false);
});
