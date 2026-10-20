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
    coolerFanRPM: 1200,
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
  const inRange = (v: unknown, lo: number, hi: number) =>
    v === undefined || (Number.isFinite(v) && +v! >= lo && +v! <= hi);
  for (const p of Object.values(c.custom)) {
    if (
      !p ||
      !Array.isArray(p.size) ||
      p.size.length !== 3 ||
      !p.size.every((v) => Number.isFinite(v) && v > 0 && v < 3)
    )
      throw new Error("Invalid custom dimensions");
    if (
      !inRange(p.fanCount, 0, 4) ||
      !inRange(p.fanSize, 0.03, 0.2) ||
      !inRange(p.towers, 1, 2) ||
      !inRange(p.finDepth, 0.01, 0.3) ||
      !inRange(p.finStart, 0, 0.1) ||
      !inRange(p.chamber, 0.08, 1) ||
      !inRange(p.shroud, 0, 0.3) ||
      !inRange(p.coolerClearance, 0.03, 1)
    )
      throw new Error(`Invalid custom ${p.kind} specification`);
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
  c.fans = (c.fans || []).slice(0, 16).map((f) => ({
    ...f,
    rpm: clamp(+f.rpm || 0, 0, part(c, f.part).maxRPM || 3000),
    enabled: !!f.enabled,
    intake: !!f.intake,
  }));
  c.radiatorMount = String(c.radiatorMount || "top").slice(0, 20);
  c.coolerFanRPM = clamp(+c.coolerFanRPM || 1200, 0, 3000);
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
export const groupOf = (mountId: string) => mountId.replace(/\d+$/, "");
const axisOf = (n: ArrayLike<number>) => {
  let best = 0;
  for (let i = 1; i < 3; i++) if (Math.abs(n[i]) > Math.abs(n[best])) best = i;
  return best;
};
const FAN_T = 0.025;
// Box centred on a fan, `t` thick along the fan's normal axis.
const fanBox = (id: string, pos: V3, normal: V3, size: number, label: string, t = FAN_T): Box => {
  const a = axisOf(normal),
    s = [size, size, size] as V3;
  s[a] = t;
  return { id, min: pos.map((v, i) => v - s[i] / 2) as V3, size: s, kind: "fan", ghost: true, label };
};
export function geometry(c: SceneConfig): CaseGeometry {
  const ca = part(c, c.parts.case),
    sz = ca.size,
    inner: V3 = [sz[0], sz[1], ca.chamber ?? sz[2] - 0.025],
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
    boardTop = sz[1] - (ca.boardTop ?? 0.04),
    boardBottom = boardTop - board.size[1],
    socket = board.socketAt || [0.122, 0.09],
    cpu: V3 = [0.018 + socket[0], boardTop - socket[1], tray - 0.04],
    slot = boardTop - (board.slots?.[c.slot] ?? 0.19);
  // GPU: PCIe edge sits in the slot at the board; the card's height runs from the board toward the glass and
  // its thickness hangs below the slot line with the fans on the underside.
  const [gl, gt, gh] = gpu.size,
    gz1 = tray - 0.006,
    gz0 = gz1 - gh,
    pcb = gpu.flowThrough ? gl * 0.65 : gl,
    slab = Math.min(0.014, gt * 0.3),
    gpuLabel = gpu.name,
    gpuPoint: V3 = [0.018 + gl / 2, slot - gt / 2, (gz0 + gz1) / 2];
  const gpuHeat: Box[] = [
    {
      id: "gpu-fins",
      min: [0.018, slot - gt, gz0],
      size: [gl, gt - slab, gh],
      kind: "gpu",
      porous: 25,
      label: gpuLabel,
    },
  ];
  if (pcb < gl)
    gpuHeat.push({
      id: "gpu-passthrough",
      min: [0.018 + pcb, slot - slab, gz0],
      size: [gl - pcb, slab, gh],
      kind: "gpu",
      porous: 25,
      label: gpuLabel,
    });
  const nGpuFans = Math.max(0, Math.round(gpu.fanCount ?? 2)),
    gpuFanSize = gpu.fanSize || Math.min(0.1, (gl / Math.max(1, nGpuFans)) * 0.9),
    gpuFans = Array.from({ length: nGpuFans }, (_, i) => ({
      pos: [0.018 + (gl * (i + 0.5)) / nGpuFans, slot - gt, (gz0 + gz1) / 2] as V3,
      normal: [0, 1, 0] as V3,
      size: gpuFanSize,
    }));
  const boxes: Box[] = [
    { id: "motherboard", min: [0.018, boardBottom, tray], size: board.size, kind: "board" },
    { id: "gpu-core", min: [0.018, slot - slab, gz0], size: [pcb, slab, gh], kind: "gpu", label: gpuLabel },
    ...gpuHeat,
    {
      id: "vrm1",
      min: [cpu[0] - 0.105, cpu[1] - 0.04, tray - 0.026],
      size: [0.035, 0.09, 0.026],
      kind: "heatsink",
      porous: 30,
    },
    {
      id: "vrm2",
      min: [cpu[0] - 0.055, cpu[1] + 0.05, tray - 0.026],
      size: [0.105, 0.025, 0.026],
      kind: "heatsink",
      porous: 30,
    },
    {
      id: "m2",
      min: [cpu[0] - 0.055, slot + 0.012, tray - 0.008],
      size: [0.08, 0.022, 0.008],
      kind: "storage",
      porous: 10,
    },
  ];
  for (let i = 0; i < 2; i++)
    boxes.push({
      id: `ram${i}`,
      min: [cpu[0] + 0.083 + i * 0.017, cpu[1] - 0.06, tray - ram.size[2]],
      size: ram.size,
      kind: "ram",
      label: "RAM",
    });
  const mounts = clone(ca.mounts || []),
    coolerFans: CaseGeometry["coolerFans"] = [],
    radiatorMounts: string[] = [];
  let radiator: V3 = [cpu[0], cpu[1], tray - cooler.size[2] / 2],
    cpuHeat: Box[] = [];
  const coolerFanSize = part(c, cooler.fanPart || "p12").size[0];
  if (cooler.coolerType === "aio") {
    boxes.push({
      id: "pump",
      min: [cpu[0] - 0.028, cpu[1] - 0.028, tray - 0.034],
      size: [0.056, 0.056, 0.03],
      kind: "pump",
      label: cooler.name,
    });
    const n = Math.max(1, Math.round(cooler.fanCount ?? 2)),
      used = mounts.filter((m) => m.radiator && groupOf(m.id) === c.radiatorMount).slice(0, n);
    if (used.length) {
      const [len, thick, wid] = cooler.size,
        na = axisOf(used[0].normal),
        sign = Math.sign(used[0].normal[na]),
        aa =
          used.length > 1 ? axisOf(used[used.length - 1].position.map((v, i) => v - used[0].position[i])) : na ? 0 : 1,
        oa = 3 - na - aa,
        centre = [0, 1, 2].map((i) => used.reduce((s, m) => s + m.position[i], 0) / used.length) as V3,
        panel = centre[na] - sign * (FAN_T / 2);
      centre[aa] = clamp(centre[aa], Math.min(len / 2, inner[aa] / 2), Math.max(inner[aa] - len / 2, inner[aa] / 2));
      const min = [0, 0, 0] as V3,
        size = [0, 0, 0] as V3;
      size[aa] = len;
      size[na] = thick;
      size[oa] = wid;
      min[aa] = centre[aa] - len / 2;
      min[oa] = centre[oa] - wid / 2;
      min[na] = sign > 0 ? panel : panel - thick;
      const rad: Box = { id: "radiator", min, size, kind: "radiator", porous: 70, label: cooler.name };
      boxes.push(rad);
      cpuHeat = [rad];
      radiator = min.map((v, i) => v + size[i] / 2) as V3;
      // Fans stack on the inner face of the radiator, evenly pitched along its core (end tanks excluded).
      const pitch = (len - 0.035) / n;
      used.forEach((m, i) => {
        m.position = [...centre] as V3;
        m.position[aa] = centre[aa] + (i - (used.length - 1) / 2) * pitch;
        m.position[na] = panel + sign * (thick + FAN_T / 2);
        radiatorMounts.push(m.id);
        boxes.push(fanBox(`rad-fan${i}`, m.position, m.normal, coolerFanSize, `${cooler.name} fans`));
      });
    }
  } else {
    // Air cooler: fin towers and fans laid out front (+x) to rear, blowing toward the rear exhaust.
    const [depth, width, height] = cooler.size,
      towers = clamp(Math.round(cooler.towers ?? 1), 1, 2),
      fans = clamp(Math.round(cooler.fanCount ?? 1), 0, 3),
      fin = cooler.finDepth ?? Math.max(0.03, depth - fans * FAN_T),
      finStart = cooler.finStart ?? 0.04,
      seq: ("fan" | "tower")[] =
        towers === 2
          ? [...(fans >= 2 ? ["fan" as const] : []), "tower", ...(fans >= 1 ? ["fan" as const] : []), "tower"]
          : [...(fans >= 1 ? ["fan" as const] : []), "tower", ...(fans >= 2 ? ["fan" as const] : [])],
      towerDepth = towers === 2 ? (fin - (fans >= 1 ? FAN_T : 0)) / 2 : fin,
      span = seq.reduce((s, e) => s + (e === "fan" ? FAN_T : towerDepth), 0);
    let front = cpu[0] + span / 2;
    const zMid = tray - (height + finStart) / 2;
    seq.forEach((e, i) => {
      const d = e === "fan" ? FAN_T : towerDepth;
      if (e === "tower")
        cpuHeat.push({
          id: `cooler-tower${i}`,
          min: [front - d, cpu[1] - width / 2, tray - height],
          size: [d, width, height - finStart],
          kind: "radiator",
          porous: 55,
          label: cooler.name,
        });
      else {
        const pos: V3 = [front - d / 2, cpu[1], zMid];
        coolerFans.push({ pos, normal: [-1, 0, 0], size: coolerFanSize });
        boxes.push(fanBox(`cooler-fan${i}`, pos, [-1, 0, 0], coolerFanSize, cooler.name));
      }
      front -= d;
    });
    boxes.push(...cpuHeat, {
      id: "cooler-base",
      min: [cpu[0] - 0.025, cpu[1] - 0.025, tray - finStart],
      size: [0.05, 0.05, finStart],
      kind: "heatsink",
    });
  }
  // The shroud stops short of the front to leave room for a front radiator stack (cut-out length estimated).
  if (ca.shroud)
    boxes.push({
      id: "shroud",
      min: [0, 0, 0],
      size: [inner[0] - 0.1, ca.shroud, inner[2]],
      kind: "case",
      label: "PSU shroud",
    });
  boxes.push(...clone(ca.blocks || []));
  return {
    size: sz,
    inner,
    origin,
    boxes,
    mounts,
    cpu,
    gpu: gpuPoint,
    radiator,
    cpuHeat,
    gpuHeat,
    gpuFans,
    coolerFans,
    radiatorMounts,
  };
}
const overlap = (a: Box, b: Box) =>
  [0, 1, 2].map((i) => Math.min(a.min[i] + a.size[i], b.min[i] + b.size[i]) - Math.max(a.min[i], b.min[i]));
const mm = (v: number) => Math.round(v * 1000);
export function issues(c: SceneConfig): string[] {
  const g = geometry(c),
    out: string[] = [],
    ca = part(c, c.parts.case),
    gpu = part(c, c.parts.gpu),
    co = part(c, c.parts.cooler),
    used = new Set<string>();
  if (gpu.size[0] > (ca.clearance || ca.size[0] - 0.05))
    out.push(
      `${gpu.name} is ${mm(gpu.size[0])} mm long; ${ca.name} allows ${mm(ca.clearance || ca.size[0] - 0.05)} mm.`,
    );
  if (gpu.size[2] > g.inner[2] - 0.01)
    out.push(`${gpu.name} is ${mm(gpu.size[2])} mm tall; the main chamber is about ${mm(g.inner[2])} mm deep.`);
  if (co.coolerType === "air" && co.size[2] > (ca.coolerClearance || g.inner[2] - 0.025))
    out.push(
      `${co.name} is ${mm(co.size[2])} mm tall; ${ca.name} allows ${mm(ca.coolerClearance || g.inner[2] - 0.025)} mm. Choose a shorter cooler or an AIO.`,
    );
  if (co.coolerType === "aio") {
    const group = (ca.mounts || []).filter((m) => m.radiator && groupOf(m.id) === c.radiatorMount),
      n = Math.round(co.fanCount ?? 2),
      fanSize = part(c, co.fanPart || "p12").size[0];
    if (!group.length)
      out.push(`${ca.name} has no ${c.radiatorMount} radiator position. Select another radiator mount.`);
    else {
      if (group.length < n)
        out.push(`${co.name} needs ${n} ${c.radiatorMount} fan positions; ${ca.name} has ${group.length}.`);
      if (!group[0].sizes.some((s) => Math.abs(s / 1000 - fanSize) < 0.004))
        out.push(
          `${c.radiatorMount} mounts take ${group[0].sizes.join("/")} mm fans; ${co.name} uses ${mm(fanSize)} mm fans.`,
        );
      const rad = g.boxes.find((b) => b.id === "radiator"),
        stack = co.size[1] + FAN_T;
      if (rad && rad.size.some((s, i) => s > g.inner[i] + 1e-9))
        out.push(`${co.name} radiator (${mm(co.size[0])} mm) is longer than the ${c.radiatorMount} of ${ca.name}.`);
      if (group[0].maxStack && stack > group[0].maxStack + 1e-9)
        out.push(
          `${co.name} radiator + fans is ${mm(stack)} mm thick; ${ca.name} allows ${mm(group[0].maxStack)} mm at the ${c.radiatorMount}.`,
        );
    }
  }
  for (const f of c.fans) {
    const m = g.mounts.find((m) => m.id === f.mount),
      fp = part(c, f.part);
    if (!m) out.push(`${f.id}: mount is not available in this case.`);
    else if (!m.sizes.some((mm) => Math.abs(mm / 1000 - fp.size[0]) < 0.004))
      out.push(`${m.name}: selected fan size is incompatible.`);
    if (used.has(f.mount)) out.push(`${f.mount}: two fans occupy the same mount.`);
    used.add(f.mount);
  }
  // Named parts must not intersect (envelopes only; real parts may have cut-outs the envelopes do not show).
  const named = g.boxes.filter((b) => b.label);
  for (let i = 0; i < named.length; i++)
    for (let j = i + 1; j < named.length; j++) {
      const a = named[i],
        b = named[j];
      if (a.label === b.label) continue;
      const o = overlap(a, b);
      if (o.every((v) => v > 0.001))
        out.push(`${a.label} overlaps ${b.label} by about ${mm(Math.min(...o))} mm. Move or choose a different part.`);
    }
  if (c.pc.placement.startsWith("under") && g.size[1] + 0.04 > c.desk.height)
    out.push("The case collides with the tabletop.");
  if (
    g.origin[0] < 0 ||
    g.origin[0] + g.size[0] > c.room.size[0] ||
    g.origin[2] < 0 ||
    g.origin[2] + g.size[2] > c.room.size[2]
  )
    out.push("PC extends outside the room. Move the setup inward.");
  return [...new Set(out)];
}
/** AIO fans belong on the radiator's mounts: set their model, adding fans where a used mount is empty. */
export function syncCoolerFans(c: SceneConfig): SceneConfig {
  const co = part(c, c.parts.cooler);
  if (co.coolerType !== "aio" || !co.fanPart) return c;
  const fp = part(c, co.fanPart);
  for (const id of geometry(c).radiatorMounts) {
    const f = c.fans.find((f) => f.mount === id);
    if (f) f.part = co.fanPart;
    else
      c.fans.push({
        id: `rad-${id}`,
        part: co.fanPart,
        mount: id,
        rpm: Math.round((fp.maxRPM || 2000) * 0.6),
        intake: !["top", "rear"].includes(groupOf(id)),
        enabled: true,
      });
  }
  return c;
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
