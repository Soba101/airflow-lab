import { catalogue } from "./catalog";
import type { SceneConfig, Part, CaseGeometry, V3, Box, Kind } from "./types";
export const clone = <T>(v: T): T => structuredClone(v);
export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export function part(c: SceneConfig, id: string): Part {
  return c.custom[id] || catalogue.find((p) => p.id === id) || catalogue[0];
}
export function preset(which = "h6"): SceneConfig {
  const h6 = which === "h6";
  return {
    version: 2,
    name: h6 ? "H6 / 5090 preset" : "4000D / 4080 air-cooled",
    parts: {
      case: h6 ? "h6" : "4000d",
      gpu: h6 ? "5090" : "4080",
      board: "b550",
      cpu: "5700",
      ram: "viper",
      storage: "qvo",
      cooler: h6 ? "h100i" : "u12a",
    },
    custom: {},
    fans: h6
      ? [
          ...Array.from({ length: 3 }, (_, i) => ({
            id: `s${i}`,
            part: "stock",
            mount: `side${i}`,
            rpm: 1200,
            intake: true,
            enabled: true,
          })),
          ...Array.from({ length: 2 }, (_, i) => ({
            id: `b${i}`,
            part: "p14",
            mount: `bottom${i}`,
            rpm: 1100,
            intake: true,
            enabled: true,
          })),
          { id: "rear", part: "p12", mount: "rear", rpm: 1100, intake: false, enabled: true },
          ...Array.from({ length: 2 }, (_, i) => ({
            id: `t${i}`,
            part: "ml120",
            mount: `top${i}`,
            rpm: 1100,
            intake: false,
            enabled: true,
          })),
        ]
      : [
          { id: "f0", part: "a12", mount: "front0", rpm: 1100, intake: true, enabled: true },
          { id: "f1", part: "a12", mount: "front1", rpm: 1100, intake: true, enabled: true },
          { id: "f2", part: "a12", mount: "front2", rpm: 1100, intake: true, enabled: true },
          { id: "rear", part: "p12", mount: "rear", rpm: 1100, intake: false, enabled: true },
        ],
    panelsOpen: false,
    radiatorMount: "top",
    slot: 0,
    room: {
      size: [4, 2.7, 3.5],
      ambient: 27,
      outside: 30,
      adjacent: 27,
      wallUA: 25,
      exchange: 0.5,
      openings: [
        { id: "w1", type: "window", wall: "left", along: 0.3, width: 1, height: 1, sill: 0.9, open: 1 },
        { id: "d1", type: "door", wall: "front", along: 0.8, width: 0.85, height: 2.05, sill: 0, open: 0.8 },
      ],
    },
    desk: { position: [2, 0, 2.1], width: 1.6, depth: 0.75, height: 0.75 },
    pc: { placement: "deskRight" },
    load: { cpu: 75, gpu: h6 ? 450 : 280, other: 60 },
    analysis: { quality: "balanced", seconds: 120, gridCheck: true },
    calibrations: [],
    activeCalibration: null,
  };
}
export function normalize(input: unknown): SceneConfig {
  const d = preset();
  if (!input || typeof input !== "object") return d;
  const a = input as Partial<SceneConfig>;
  if (a.version !== 2) throw new Error("Unsupported scene version");
  const c = clone(a) as SceneConfig;
  c.custom = c.custom || {};
  for (const p of Object.values(c.custom)) {
    if (
      !p ||
      !Array.isArray(p.size) ||
      p.size.length !== 3 ||
      !p.size.every((v) => Number.isFinite(v) && v > 0 && v < 3)
    )
      throw new Error("Invalid custom dimensions");
  }
  for (const k of Object.keys(d.parts) as (keyof SceneConfig["parts"])[]) {
    const p = c.custom[c.parts?.[k]] || catalogue.find((p) => p.id === c.parts?.[k]);
    if (!p || p.kind !== k) throw new Error(`Unknown ${k} part`);
  }
  c.name = String(c.name || "Untitled scene").slice(0, 80);
  c.room = { ...d.room, ...c.room };
  c.room.size = c.room.size.map((v, i) => clamp(Number(v) || d.room.size[i], i === 1 ? 2 : 2, i === 1 ? 4 : 8)) as V3;
  for (const k of ["ambient", "outside", "adjacent"] as const) c.room[k] = clamp(Number(c.room[k]) || 0, 0, 45);
  c.room.wallUA = clamp(+c.room.wallUA || 0, 0, 200);
  c.room.exchange = clamp(+c.room.exchange || 0, 0, 15);
  c.room.openings = (c.room.openings || [])
    .slice(0, 12)
    .filter((o) => ["window", "door"].includes(o.type) && ["left", "right", "front", "back"].includes(o.wall))
    .map((o) => ({
      ...o,
      along: clamp(+o.along || 0.5, 0.05, 0.95),
      width: clamp(+o.width || 0.85, 0.3, 2.4),
      height: clamp(+o.height || 1, 0.2, c.room.size[1] - 0.05),
      sill: clamp(+o.sill || 0, 0, c.room.size[1] - 0.3),
      open: clamp(+o.open || 0, 0, 1),
    }));
  for (const o of c.room.openings) {
    o.height = Math.min(o.height, c.room.size[1] - o.sill - 0.02);
    const span = ["left", "right"].includes(o.wall) ? c.room.size[2] : c.room.size[0];
    o.width = Math.min(o.width, span - 0.1);
    o.along = clamp(o.along, (o.width / 2 + 0.02) / span, 1 - (o.width / 2 + 0.02) / span);
  }
  c.desk = { ...d.desk, ...c.desk };
  c.desk.width = clamp(+c.desk.width || 1.6, 0.8, Math.min(3, c.room.size[0] - 0.2));
  c.desk.depth = clamp(+c.desk.depth || 0.75, 0.4, 1.2);
  c.desk.height = clamp(+c.desk.height || 0.75, 0.6, 1.1);
  c.desk.position = [
    clamp(c.desk.position?.[0] || 2, c.desk.width / 2 + 0.1, c.room.size[0] - c.desk.width / 2 - 0.1),
    0,
    clamp(c.desk.position?.[2] || 2, c.desk.depth / 2 + 0.2, c.room.size[2] - c.desk.depth / 2 - 0.2),
  ];
  c.pc = { ...d.pc, ...c.pc };
  if (!["deskLeft", "deskRight", "underLeft", "underRight", "floorLeft", "floorRight"].includes(c.pc.placement))
    c.pc.placement = "deskRight";
  c.load = { ...d.load, ...c.load };
  c.load.cpu = clamp(+c.load.cpu || 0, 0, 250);
  c.load.gpu = clamp(+c.load.gpu || 0, 0, 800);
  c.load.other = clamp(+c.load.other || 0, 0, 300);
  c.fans = (c.fans || [])
    .slice(0, 16)
    .map((f) => ({
      ...f,
      rpm: clamp(+f.rpm || 0, 0, part(c, f.part).maxRPM || 3000),
      enabled: !!f.enabled,
      intake: !!f.intake,
    }));
  c.slot = clamp(Math.floor(+c.slot || 0), 0, (part(c, c.parts.board).slots?.length || 1) - 1);
  c.analysis = { ...d.analysis, ...c.analysis };
  c.analysis.seconds = clamp(+c.analysis.seconds || 0, 0, 3600);
  if (!["draft", "balanced", "fine"].includes(c.analysis.quality)) c.analysis.quality = "balanced";
  c.calibrations = Array.isArray(c.calibrations)
    ? c.calibrations.filter(
        (p) =>
          Number.isFinite(p.cpuR) && p.cpuR > 0 && p.cpuR < 3 && Number.isFinite(p.gpuR) && p.gpuR > 0 && p.gpuR < 3,
      )
    : [];
  return c;
}
export function signature(c: SceneConfig) {
  return JSON.stringify({
    parts: c.parts,
    custom: c.custom,
    fans: c.fans.map((f) => [f.part, f.mount, f.intake, f.enabled]),
    radiator: c.radiatorMount,
    panels: c.panelsOpen,
    slot: c.slot,
  });
}
export function loadScene(storage: Pick<Storage, "getItem">): SceneConfig {
  try {
    const v = storage.getItem("airflow-scene-v2");
    if (v) return normalize(JSON.parse(v));
  } catch {}
  const c = preset();
  try {
    const r = JSON.parse(storage.getItem("airflow-room-v1") || "null");
    if (r) {
      c.room.size = [r.width || 4, r.height || 2.7, r.depth || 3.5];
      c.room.ambient = r.initial ?? 27;
      c.room.outside = r.outside ?? 30;
      c.desk.position = [r.deskX || 2, 0, r.deskY || 2.1];
      c.desk.width = r.deskWidth || 1.6;
      c.desk.depth = r.deskDepth || 0.75;
      c.desk.height = r.deskHeight || 0.75;
      c.pc.placement = r.pcPlacement || "deskRight";
    }
    const b = JSON.parse(storage.getItem("don-h6-build-v1") || "null");
    if (b) {
      c.load = { cpu: b.cpuWatts ?? 75, gpu: b.gpuWatts ?? 450, other: b.otherWatts ?? 60 };
      b.fans?.forEach((f: any, i: number) => {
        if (c.fans[i]) Object.assign(c.fans[i], { rpm: f.rpm, intake: f.intake, enabled: f.on });
      });
    }
  } catch {}
  return normalize(c);
}
export function geometry(c: SceneConfig): CaseGeometry {
  const ca = part(c, c.parts.case),
    sz = ca.size,
    inner: [number, number, number] = [sz[0], sz[1], ca.id === "h6" ? 0.2 : sz[2] - 0.025],
    board = part(c, c.parts.board),
    gpu = part(c, c.parts.gpu),
    cooler = part(c, c.parts.cooler),
    ram = part(c, c.parts.ram);
  const left = c.pc.placement.endsWith("Left"),
    floor = c.pc.placement.startsWith("floor"),
    under = c.pc.placement.startsWith("under");
  const x =
      c.desk.position[0] +
      (left ? -1 : 1) * (floor ? c.desk.width / 2 + sz[0] / 2 + 0.08 : c.desk.width / 2 - sz[0] / 2 - 0.06),
    z = c.desk.position[2],
    y = floor || under ? 0.04 : c.desk.height + 0.035;
  const origin: V3 = [x - sz[0] / 2, y, z - sz[2] / 2],
    tray = inner[2] - 0.008,
    boardBottom = Math.max(0.06, sz[1] - 0.04 - board.size[1]),
    slot = (board.slots?.[c.slot] || 0.205) + (sz[1] - 0.435),
    cpu: V3 = [0.14, sz[1] - 0.13, tray - 0.04],
    gpuPoint: V3 = [gpu.size[0] / 2 + 0.018, slot - gpu.size[1] / 2, 0.018 + gpu.size[2] / 2];
  const boxes: Box[] = [
    { id: "motherboard", min: [0.018, boardBottom, tray], size: board.size, kind: "board" },
    {
      id: "gpu-core",
      min: [0.018, slot - gpu.size[1] * 0.28, 0.018],
      size: [gpu.size[0], gpu.size[1] * 0.28, gpu.size[2]],
      kind: "gpu",
    },
    {
      id: "gpu-fins",
      min: [0.018, slot - gpu.size[1], 0.018],
      size: [gpu.size[0], gpu.size[1] * 0.72, gpu.size[2]],
      kind: "gpu",
      porous: 25,
    },
    { id: "vrm1", min: [0.035, cpu[1] - 0.04, tray - 0.026], size: [0.035, 0.09, 0.026], kind: "heatsink", porous: 30 },
    {
      id: "vrm2",
      min: [0.085, cpu[1] + 0.05, tray - 0.026],
      size: [0.105, 0.025, 0.026],
      kind: "heatsink",
      porous: 30,
    },
    { id: "m2", min: [0.085, slot + 0.012, tray - 0.008], size: [0.08, 0.022, 0.008], kind: "storage", porous: 10 },
  ];
  for (let i = 0; i < 2; i++)
    boxes.push({
      id: `ram${i}`,
      min: [0.223 + i * 0.017, cpu[1] - 0.06, tray - ram.size[2]],
      size: ram.size,
      kind: "ram",
    });
  let radiator: V3 = [0.16, inner[1] - 0.045, 0.1];
  if (cooler.coolerType === "aio") {
    if (c.radiatorMount === "top")
      boxes.push({
        id: "radiator",
        min: [0.025, inner[1] - 0.027, 0.04],
        size: [cooler.size[0], 0.027, cooler.size[2]],
        kind: "radiator",
        porous: 70,
      });
    else {
      radiator = [inner[0] - 0.045, 0.23, 0.1];
      boxes.push({
        id: "radiator",
        min: [inner[0] - 0.052, 0.07, 0.04],
        size: [0.027, cooler.size[0], cooler.size[2]],
        kind: "radiator",
        porous: 70,
      });
    }
    boxes.push({
      id: "pump",
      min: [cpu[0] - 0.028, cpu[1] - 0.028, tray - 0.034],
      size: [0.056, 0.056, 0.03],
      kind: "pump",
    });
  } else {
    radiator = [cpu[0], cpu[1], tray - cooler.size[2] / 2];
    boxes.push({
      id: "air-cooler",
      min: [cpu[0] - cooler.size[0] / 2, cpu[1] - cooler.size[1] / 2, tray - cooler.size[2]],
      size: cooler.size,
      kind: "radiator",
      porous: 55,
    });
  }
  if (ca.id === "4000d") boxes.push({ id: "shroud", min: [0, 0, 0], size: [inner[0], 0.06, inner[2]], kind: "case" });
  return { size: sz, inner, origin, boxes, mounts: ca.mounts || [], cpu, gpu: gpuPoint, radiator };
}
export function issues(c: SceneConfig): string[] {
  const g = geometry(c),
    out: string[] = [],
    ca = part(c, c.parts.case),
    gpu = part(c, c.parts.gpu),
    co = part(c, c.parts.cooler),
    used = new Set<string>();
  if (gpu.size[0] > (ca.clearance || ca.size[0] - 0.05)) out.push("GPU exceeds the case’s nominal length allowance.");
  if (
    co.coolerType === "aio" &&
    c.radiatorMount === "front" &&
    !g.mounts.some((m) => m.id.startsWith("front") && m.radiator)
  )
    out.push("This case does not support a front radiator. Select a valid radiator mount.");
  for (const f of c.fans) {
    const m = g.mounts.find((m) => m.id === f.mount),
      fp = part(c, f.part);
    if (!m) out.push(`${f.id}: mount is not available in this case.`);
    else if (!m.sizes.some((mm) => Math.abs(mm / 1000 - fp.size[0]) < 0.004))
      out.push(`${m.name}: selected fan size is incompatible.`);
    if (used.has(f.mount)) out.push(`${f.mount}: two fans occupy the same mount.`);
    used.add(f.mount);
  }
  if (co.coolerType === "air" && co.size[2] > g.inner[2] - 0.025)
    out.push("Air cooler exceeds the estimated tray-to-panel space.");
  if (c.pc.placement.startsWith("under") && g.size[1] + 0.04 > c.desk.height)
    out.push("The case collides with the tabletop.");
  if (
    g.origin[0] < 0 ||
    g.origin[0] + g.size[0] > c.room.size[0] ||
    g.origin[2] < 0 ||
    g.origin[2] + g.size[2] > c.room.size[2]
  )
    out.push("PC extends outside the room. Move the setup inward.");
  for (const b of g.boxes)
    if (b.id === "radiator" && (b.min[0] + b.size[0] > g.inner[0] || b.min[1] + b.size[1] > g.inner[1]))
      out.push("Radiator envelope exceeds available case space.");
  return [...new Set(out)];
}
export function makeCustom(c: SceneConfig, kind: Kind, from: string): Part {
  const base = part(c, from),
    id = `custom-${kind}-${Date.now()}`;
  return {
    ...clone(base),
    id,
    kind,
    name: `Custom ${kind}`,
    verified: [],
    source: undefined,
    note: "User dimensions and performance assumptions. Inherited mount/slot coordinates remain approximate.",
  };
}
