export type V3 = [number, number, number];
export type Kind = "case" | "gpu" | "board" | "cpu" | "ram" | "storage" | "cooler" | "fan";
// Case-local coordinates (metres): x from the rear I/O panel toward the front, y up from the case floor,
// z from the glass/left side panel toward the motherboard tray. Mount normals point into the case.
export interface Part {
  id: string;
  kind: Kind;
  name: string;
  size: V3;
  source?: string;
  verified: string[];
  note?: string;
  maxRPM?: number;
  cfm?: number;
  pressure?: number;
  curve?: [number, number][];
  curveStatus?: string;
  coolerType?: "air" | "aio";
  resistance?: number;
  capacity?: number;
  socket?: string;
  /** board: PCIe x16 slot centrelines, metres below the board's top edge */
  slots?: number[];
  /** board: CPU socket centre [from rear (I/O) edge, below top edge] */
  socketAt?: [number, number];
  mounts?: Mount[];
  /** case: maximum GPU length */
  clearance?: number;
  /** case: maximum air-cooler height */
  coolerClearance?: number;
  /** case: glass-to-motherboard-tray depth of the main chamber */
  chamber?: number;
  /** case: PSU shroud height spanning the main chamber floor (0 = none) */
  shroud?: number;
  /** case: board top edge below the case top */
  boardTop?: number;
  /** case: extra fixed solids (PSU/drive chamber parts) */
  blocks?: Box[];
  /** gpu/cooler: number of integrated fans; gpu fans blow up into the heatsink */
  fanCount?: number;
  /** gpu: fan diameter */
  fanSize?: number;
  /** gpu: fin stack extends past a short PCB so air passes straight through */
  flowThrough?: boolean;
  /** air cooler: fin towers (1 or 2) */
  towers?: number;
  /** air cooler: front-to-back fin depth without fans */
  finDepth?: number;
  /** air cooler: height above the board where fins start (RAM clearance) */
  finStart?: number;
  /** cooler: fan model supplied with the cooler (catalogue fan id) */
  fanPart?: string;
}
export interface Mount {
  id: string;
  name: string;
  position: V3;
  normal: V3;
  sizes: number[];
  radiator?: boolean;
  /** maximum radiator + fan stack thickness at this mount, when published */
  maxStack?: number;
  /** distance of the fan centre from the panel along the normal (set by geometry for radiator stacks) */
  offset?: number;
}
export interface FanConfig {
  id: string;
  part: string;
  mount: string;
  rpm: number;
  intake: boolean;
  enabled: boolean;
}
export interface Opening {
  id: string;
  type: "window" | "door";
  wall: "left" | "right" | "front" | "back";
  along: number;
  width: number;
  height: number;
  sill: number;
  open: number;
}
export interface Calibration {
  id: string;
  signature: string;
  ambient: number;
  cpuWatts: number;
  gpuWatts: number;
  rpm: number;
  cpuTemp: number;
  gpuTemp: number;
  cpuR: number;
  gpuR: number;
  created: string;
}
export interface SceneConfig {
  version: 2;
  name: string;
  parts: Record<Exclude<Kind, "fan">, string>;
  custom: Record<string, Part>;
  fans: FanConfig[];
  panelsOpen: boolean;
  /** mount group (mount id without its index, e.g. "top", "front") holding the AIO radiator */
  radiatorMount: string;
  /** air-cooler fan speed */
  coolerFanRPM: number;
  slot: number;
  room: {
    size: V3;
    ambient: number;
    outside: number;
    adjacent: number;
    wallUA: number;
    exchange: number;
    openings: Opening[];
  };
  desk: { position: V3; width: number; depth: number; height: number };
  pc: { placement: "deskLeft" | "deskRight" | "underLeft" | "underRight" | "floorLeft" | "floorRight" };
  load: { cpu: number; gpu: number; other: number };
  analysis: { quality: "draft" | "balanced" | "fine"; seconds: number; gridCheck: boolean };
  calibrations: Calibration[];
  activeCalibration: string | null;
}
export interface Box {
  id: string;
  min: V3;
  size: V3;
  kind: string;
  porous?: number;
  /** used for fit/collision checks and drawing only, not as a flow obstacle */
  ghost?: boolean;
  /** human-readable part name for conflict messages */
  label?: string;
}
export interface FanSpot {
  pos: V3;
  normal: V3;
  size: number;
}
export interface CaseGeometry {
  size: V3;
  inner: V3;
  origin: V3;
  boxes: Box[];
  mounts: Mount[];
  cpu: V3;
  gpu: V3;
  radiator: V3;
  /** boxes that receive CPU/GPU heat (radiator or fin stacks; GPU heatsink) */
  cpuHeat: Box[];
  gpuHeat: Box[];
  gpuFans: FanSpot[];
  coolerFans: FanSpot[];
  /** mount ids covered by the AIO radiator */
  radiatorMounts: string[];
}
export interface Field {
  n: V3;
  size: V3;
  origin: V3;
  velocity: Float32Array;
  temperature: Float32Array;
  pressure: Float32Array;
  solid: Uint8Array;
}
export interface Diagnostics {
  divergence: number;
  massError: number;
  energyError: number;
  couplingError: number;
  pressureResidual: number;
  cpu: number;
  gpu: number;
  cpuTransient?: number;
  gpuTransient?: number;
  coolant: number;
  room: number;
  intake: number;
  exhaust: number;
  flow: number;
  recirculation: number;
  time: number;
  steps: number;
  calibrated: boolean;
  fanFlows: { id: string; q: number; pa: number }[];
}
export interface Snapshot {
  room: Field;
  pc: Field;
  stats: Diagnostics;
  revision: number;
  backend: string;
  analysis?: {
    state: "running" | "converged" | "incomplete" | "cancelled" | "stale";
    elapsed: number;
    budget: number;
    progress: number;
    gridDelta?: number;
    reason?: string;
  };
  baseline?: Diagnostics;
}
export type WorkerMessage =
  | { type: "configure"; config: SceneConfig; revision: number; baseline?: SceneConfig | null }
  | { type: "run"; quality: "draft" | "balanced" | "fine"; seconds: number; gridCheck: boolean }
  | { type: "cancel" }
  | { type: "pause"; value: boolean };
