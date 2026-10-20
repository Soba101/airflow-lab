import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { geometry, part, clone, clamp } from "./config";
import type { SceneConfig, V3, Field, Snapshot, CaseGeometry } from "./types";
export class LabView {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1, 0.003, 100);
  controls: OrbitControls;
  root = new THREE.Group();
  pcGroup = new THREE.Group();
  deskGroup = new THREE.Group();
  roomDecor: THREE.Object3D[] = [];
  shells: THREE.Object3D[] = [];
  snapshot: Snapshot | null = null;
  config: SceneConfig;
  g: CaseGeometry;
  focusMode: "room" | "pc" = "room";
  mode: "orbit" | "desk" | "opening" | "smoke" = "orbit";
  selectedOpening = 0;
  onEdit: (c: SceneConfig) => void = () => {};
  onFocus: (f: string) => void = () => {};
  density = 1800;
  smoke = true;
  lines = true;
  arrows = false;
  overlay = "flow";
  slice = 1;
  transparent = true;
  walls = true;
  emitter = "auto";
  customSeed: V3 | null = null;
  targetPos = new THREE.Vector3();
  targetLook = new THREE.Vector3();
  ray = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  clock = new THREE.Clock();
  positions: Float32Array;
  colors: Float32Array;
  ages: Float32Array;
  trailPos: Float32Array;
  trails: THREE.LineSegments;
  points: THREE.Points;
  stream = new THREE.LineSegments();
  sliceCloud = new THREE.Points();
  arrowGroup = new THREE.Group();
  labelGroup = new THREE.Group();
  last = 0;
  lastVectors = 0;
  dragStart: V3 | null = null;
  constructor(
    public element: HTMLElement,
    c: SceneConfig,
  ) {
    this.config = c;
    this.g = geometry(c);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor("#101722");
    this.renderer.localClippingEnabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    element.append(this.renderer.domElement);
    this.scene.fog = new THREE.Fog("#101722", 14, 30);
    this.scene.add(new THREE.HemisphereLight(0xf1f5ff, 0x45536c, 2.6));
    const key = new THREE.DirectionalLight(0xffefd6, 3);
    key.position.set(3, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -5;
    key.shadow.camera.right = 5;
    key.shadow.camera.top = 5;
    key.shadow.camera.bottom = -5;
    this.scene.add(key);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.12;
    this.controls.maxDistance = 16;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.target.set(2, 0.7, 1.8);
    this.camera.position.set(6.8, 5.3, 7);
    this.scene.add(this.root);
    this.scene.add(this.labelGroup);
    this.positions = new Float32Array(9000 * 3).fill(0);
    this.colors = new Float32Array(9000 * 3);
    this.ages = new Float32Array(9000).fill(100);
    this.trailPos = new Float32Array(9000 * 6);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    pg.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    this.points = new THREE.Points(
      pg,
      new THREE.PointsMaterial({
        size: 0.027,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    this.scene.add(this.points);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute("position", new THREE.BufferAttribute(this.trailPos, 3));
    this.trails = new THREE.LineSegments(
      tg,
      new THREE.LineBasicMaterial({ color: "#71dcec", transparent: true, opacity: 0.38, depthWrite: false }),
    );
    this.scene.add(this.trails, this.stream, this.sliceCloud, this.arrowGroup);
    this.build(c);
    new ResizeObserver(() => this.resize()).observe(element);
    this.resize();
    this.bind();
    requestAnimationFrame((t) => this.animate(t));
  }
  disposeGroup(g: THREE.Group) {
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.filter(Boolean).forEach((m) => m.dispose());
    });
    g.clear();
  }
  mat(color: string, opacity = 1) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.72,
      metalness: 0.15,
      transparent: opacity < 1,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: opacity > 0.5,
    });
  }
  box(parent: THREE.Object3D, min: V3, size: V3, color: string, opacity = 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), this.mat(color, opacity));
    mesh.position.set(...(min.map((v, i) => v + size[i] / 2) as V3));
    mesh.castShadow = opacity > 0.5;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  fan(pos: V3, normal: V3, size: number, thickness: number, rpm: number, ring: string) {
    const group = new THREE.Group();
    group.position.set(...pos);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...normal).normalize());
    this.box(group, [-size / 2, -size / 2, -thickness / 2], [size, size, thickness], rpm ? "#344f39" : "#273b34", 0.48);
    group.add(new THREE.Mesh(new THREE.TorusGeometry(size * 0.43, size * 0.025, 6, 32), this.mat(ring)));
    const blades = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const blade = new THREE.Mesh(
          new THREE.CircleGeometry(size * 0.15, 12),
          this.mat(rpm ? "#9eb77c" : "#52644e", 0.8),
        ),
        theta = (i * Math.PI * 2) / 7;
      blade.position.set(Math.cos(theta) * size * 0.22, Math.sin(theta) * size * 0.22, 0);
      blades.add(blade);
    }
    blades.userData.rpm = rpm;
    group.add(blades);
    this.pcGroup.add(group);
  }
  label(text: string, pos: V3, color = "#d5e6bb", scale = 0.4) {
    const can = document.createElement("canvas");
    can.width = 512;
    can.height = 72;
    const ctx = can.getContext("2d")!;
    ctx.fillStyle = "#14221cdd";
    ctx.fillRect(0, 0, 512, 72);
    ctx.fillStyle = color;
    ctx.font = "24px monospace";
    ctx.textAlign = "center";
    ctx.fillText(text, 256, 45);
    const texture = new THREE.CanvasTexture(can),
      sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    sprite.position.set(...pos);
    sprite.scale.set(scale, (scale * 72) / 512, 1);
    this.labelGroup.add(sprite);
    return sprite;
  }
  build(c: SceneConfig) {
    this.config = clone(c);
    this.g = geometry(c);
    this.disposeGroup(this.root);
    this.disposeGroup(this.labelGroup);
    this.pcGroup = new THREE.Group();
    this.deskGroup = new THREE.Group();
    this.roomDecor = [];
    this.shells = [];
    const [rx, rh, rz] = c.room.size;
    this.roomDecor.push(this.box(this.root, [-0.06, -0.06, -0.06], [rx + 0.12, 0.06, rz + 0.12], "#35483d"));
    const grid = new THREE.GridHelper(Math.max(rx, rz), Math.round(Math.max(rx, rz) * 4), 0x799071, 0x475d4d);
    grid.position.set(rx / 2, 0.002, rz / 2);
    this.root.add(grid);
    this.roomDecor.push(grid);
    for (const wall of ["left", "right", "front", "back"] as const) {
      const span = ["left", "right"].includes(wall) ? rz : rx,
        shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(span, 0);
      shape.lineTo(span, rh);
      shape.lineTo(0, rh);
      shape.closePath();
      for (const o of c.room.openings.filter((o) => o.wall === wall)) {
        const hole = new THREE.Path(),
          a = o.along * span - o.width / 2,
          b = a + o.width,
          y = o.sill;
        hole.moveTo(a, y);
        hole.lineTo(a, y + o.height);
        hole.lineTo(b, y + o.height);
        hole.lineTo(b, y);
        hole.closePath();
        shape.holes.push(hole);
      }
      const mesh = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        this.mat("#466159", wall === "left" || wall === "back" ? 0.42 : 0.1),
      );
      if (wall === "left" || wall === "right") {
        mesh.rotation.y = -Math.PI / 2;
        mesh.position.set(wall === "left" ? 0 : rx, 0, 0);
      } else mesh.position.set(0, 0, wall === "front" ? rz : 0);
      mesh.userData.wall = true;
      mesh.visible = this.walls;
      this.root.add(mesh);
      this.roomDecor.push(mesh);
    }
    for (const o of c.room.openings) {
      const horiz = ["front", "back"].includes(o.wall),
        span = horiz ? rx : rz,
        along = o.along * span,
        position: V3 =
          o.wall === "left"
            ? [0, o.sill + o.height / 2, along]
            : o.wall === "right"
              ? [rx, o.sill + o.height / 2, along]
              : [along, o.sill + o.height / 2, o.wall === "front" ? rz : 0];
      const open = new THREE.Group();
      open.position.set(...position);
      if (!horiz) open.rotation.y = Math.PI / 2;
      const frame = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(o.width, o.height, 0.025)),
        new THREE.LineBasicMaterial({ color: o.type === "window" ? "#91e5dc" : "#d6b785" }),
      );
      open.add(frame);
      if (o.type === "window") {
        const glass = new THREE.Mesh(
          new THREE.PlaneGeometry(o.width * 0.96, o.height * 0.96),
          new THREE.MeshPhysicalMaterial({
            color: "#89cad4",
            roughness: 0.1,
            metalness: 0.1,
            transparent: true,
            opacity: 0.18 + (1 - o.open) * 0.28,
            side: THREE.DoubleSide,
          }),
        );
        glass.position.z = 0.006;
        open.add(glass);
      } else {
        const hinge = new THREE.Group();
        hinge.position.x = -o.width / 2;
        const door = this.box(hinge, [0, -o.height / 2, -0.015], [o.width, o.height, 0.03], "#8b7655", 0.5);
        hinge.rotation.y = (-o.open * Math.PI) / 2;
        open.add(hinge);
      }
      this.root.add(open);
      this.roomDecor.push(open);
      this.label(
        `${o.type.toUpperCase()} ${Math.round(o.open * 100)}%`,
        [position[0], position[1] + o.height / 2 + 0.12, position[2]],
        o.type === "window" ? "#99e8e0" : "#e5c193",
        0.5,
      );
    }
    const d = c.desk;
    this.deskGroup.position.set(d.position[0], 0, d.position[2]);
    this.box(this.deskGroup, [-d.width / 2, d.height, -d.depth / 2], [d.width, 0.035, d.depth], "#a49672");
    for (const x of [-1, 1])
      for (const z of [-1, 1])
        this.box(
          this.deskGroup,
          [x * (d.width / 2 - 0.055) - 0.022, 0, z * (d.depth / 2 - 0.055) - 0.022],
          [0.044, d.height, 0.044],
          "#253a35",
        );
    this.box(this.deskGroup, [-0.28, d.height + 0.2, -d.depth / 2 + 0.11], [0.56, 0.32, 0.025], "#1e302b");
    this.box(this.deskGroup, [-0.25, d.height + 0.225, -d.depth / 2 + 0.126], [0.5, 0.267, 0.005], "#557b6c");
    this.box(this.deskGroup, [-0.02, d.height + 0.04, -d.depth / 2 + 0.12], [0.04, 0.16, 0.035], "#33473b");
    this.box(this.deskGroup, [-0.14, d.height + 0.036, -d.depth / 2 + 0.06], [0.28, 0.01, 0.16], "#263d34");
    this.box(this.deskGroup, [-0.22, d.height + 0.036, 0.08], [0.44, 0.015, 0.14], "#425b49");
    this.box(this.deskGroup, [0.28, d.height + 0.038, 0.08], [0.06, 0.025, 0.1], "#586e4b");
    this.box(this.deskGroup, [-0.23, 0.42, d.depth / 2 + 0.13], [0.46, 0.08, 0.42], "#334b44");
    this.box(this.deskGroup, [-0.23, 0.5, d.depth / 2 + 0.46], [0.46, 0.5, 0.07], "#2b413d");
    this.box(this.deskGroup, [-0.04, 0.03, d.depth / 2 + 0.27], [0.08, 0.39, 0.08], "#455747");
    this.root.add(this.deskGroup);
    this.pcGroup.position.set(...this.g.origin);
    this.pcGroup.userData.pc = true;
    this.box(this.pcGroup, [0, 0, 0], [this.g.size[0], 0.012, this.g.size[2]], "#202f2a");
    this.box(this.pcGroup, [0, this.g.size[1] - 0.012, 0], [this.g.size[0], 0.012, this.g.size[2]], "#30483b");
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(...this.g.size)),
      new THREE.LineBasicMaterial({ color: "#b4c6a5", transparent: true, opacity: 0.55 }),
    );
    edge.position.set(...(this.g.size.map((v) => v / 2) as V3));
    this.pcGroup.add(edge);
    for (const b of this.g.boxes) {
      if (b.ghost) continue;
      const colors: Record<string, string> = {
        gpu: "#7094b8",
        board: "#25374a",
        ram: "#d6b97e",
        radiator: "#657181",
        heatsink: "#9ba9bc",
        pump: "#96b5d4",
        storage: "#56806f",
        case: "#263d32",
      };
      const mesh = this.box(this.pcGroup, b.min, b.size, colors[b.kind] || "#526b56", 1);
      mesh.userData.part = b.kind;
      // Rough fin texture: GPU and radiator fins run across the airflow, tower fins are stacked plates.
      const fins = (axis: number, pitch: number) => {
        for (let t = b.min[axis] + pitch / 2; t < b.min[axis] + b.size[axis]; t += pitch) {
          const min = [...b.min] as V3,
            size = [...b.size] as V3;
          min[axis] = t;
          size[axis] = 0.0008;
          min[axis === 2 ? 0 : 2] -= 0.0008;
          this.box(this.pcGroup, min, size, "#8a9a76");
        }
      };
      if (b.kind === "gpu" && b.porous) fins(0, 0.012);
      if (b.id === "radiator") fins(b.size[0] >= b.size[2] ? 0 : 2, 0.01);
      if (b.id.startsWith("cooler-tower")) fins(2, 0.008);
    }
    for (const f of c.fans) {
      const mount = this.g.mounts.find((m) => m.id === f.mount);
      if (!mount) continue;
      const fp = part(c, f.part);
      this.fan(
        mount.position,
        mount.normal,
        fp.size[0],
        fp.size[1],
        f.enabled ? f.rpm : 0,
        f.intake ? "#afd77e" : "#dfa47c",
      );
    }
    const gpuRPM = 600 + c.load.gpu * 2;
    for (const f of this.g.gpuFans) this.fan(f.pos, f.normal, f.size, 0.012, gpuRPM, "#bdd398");
    for (const f of this.g.coolerFans) this.fan(f.pos, f.normal, f.size, 0.025, c.coolerFanRPM, "#c9b8e0");
    if (part(c, c.parts.cooler).coolerType === "aio") {
      const a = new THREE.Vector3(...this.g.cpu),
        b = new THREE.Vector3(...this.g.radiator);
      for (const offset of [-0.012, 0.012]) {
        const curve = new THREE.CatmullRomCurve3([
          a.clone().add(new THREE.Vector3(offset, 0, -0.025)),
          a.clone().add(new THREE.Vector3(-0.05, 0.025, -0.065)),
          b.clone().add(new THREE.Vector3(0.04, -0.06, -0.02)),
          b.clone().add(new THREE.Vector3(offset, -0.012, 0)),
        ]);
        this.pcGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.004, 6, false), this.mat("#40594e")));
      }
    }
    for (const z of [0.001, this.g.size[2] - 0.001]) {
      const shell = this.box(this.pcGroup, [0, 0, z], [this.g.size[0], this.g.size[1], 0.002], "#afc9bb", 0.025);
      shell.visible = !c.panelsOpen;
      this.shells.push(shell);
    }
    this.root.add(this.pcGroup);
    this.applySlice();
    this.ages.fill(100);
    if (this.focusMode === "pc") this.focus("pc", false);
  }
  roomCamera: THREE.Vector3 | null = null;
  roomTarget: THREE.Vector3 | null = null;
  resize() {
    const { width, height } = this.element.getBoundingClientRect();
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.focusMode === "pc") this.focus("pc", false);
  }
  focus(mode: "room" | "pc", animate = true) {
    const changed = this.focusMode !== mode;
    if (changed && mode === "pc") {
      this.roomCamera = this.camera.position.clone();
      this.roomTarget = this.controls.target.clone();
    }
    this.focusMode = mode;
    this.onFocus(mode);
    this.deskGroup.visible = mode === "room";
    this.roomDecor.forEach((o) => (o.visible = mode === "room"));
    this.labelGroup.visible = mode === "room";
    if (changed) this.ages.fill(100);
    if (mode === "pc") {
      const center = new THREE.Vector3(...this.g.origin).add(new THREE.Vector3(...this.g.size).multiplyScalar(0.5));
      this.targetLook.copy(center);
      const vFov = THREE.MathUtils.degToRad(this.camera.fov),
        hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect),
        radius = new THREE.Vector3(...this.g.size).length() / 2;
      const distance = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 1.4;
      this.targetPos.copy(center).add(new THREE.Vector3(0.65, 0.35, -1).normalize().multiplyScalar(distance));
    } else {
      this.targetLook.set(this.config.room.size[0] / 2, 0.7, this.config.room.size[2] / 2);
      this.targetPos.copy(this.targetLook).add(new THREE.Vector3(4.5, 3.8, 5.2));
      if (this.roomCamera && this.roomTarget) {
        this.targetPos.copy(this.roomCamera);
        this.targetLook.copy(this.roomTarget);
      }
    }
    if (!animate) {
      this.camera.position.copy(this.targetPos);
      this.controls.target.copy(this.targetLook);
    }
    this.transition = animate ? 1 : 0;
    this.points.material instanceof THREE.PointsMaterial && (this.points.material.size = mode === "pc" ? 0.006 : 0.027);
  }
  transition = 0;
  applySlice() {
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), this.g.origin[2] + this.g.size[2] * this.slice);
    this.pcGroup.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.material) {
        const materials = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of materials) {
          mat.clippingPlanes = this.slice < 0.995 ? [plane] : [];
          mat.needsUpdate = true;
        }
      }
    });
  }
  fieldSample(f: Field, world: V3) {
    const p = world.map((v, i) => ((v - f.origin[i]) / f.size[i]) * f.n[i] - 0.5),
      i = p.map((v, a) => clamp(Math.floor(v), 0, f.n[a] - 1)),
      a = p.map((v, k) => clamp(v - i[k], 0, 1));
    let vx = 0,
      vy = 0,
      vz = 0,
      t = 0,
      pressure = 0,
      weight = 0;
    for (let z = 0; z < 2; z++)
      for (let y = 0; y < 2; y++)
        for (let x = 0; x < 2; x++) {
          const ix = Math.min(i[0] + x, f.n[0] - 1),
            iy = Math.min(i[1] + y, f.n[1] - 1),
            iz = Math.min(i[2] + z, f.n[2] - 1),
            k = ix + f.n[0] * (iy + f.n[1] * iz),
            w = (x ? a[0] : 1 - a[0]) * (y ? a[1] : 1 - a[1]) * (z ? a[2] : 1 - a[2]);
          if (f.solid[k]) continue;
          weight += w;
          vx += f.velocity[k * 3] * w;
          vy += f.velocity[k * 3 + 1] * w;
          vz += f.velocity[k * 3 + 2] * w;
          t += f.temperature[k] * w;
          pressure += f.pressure[k] * w;
        }
    return {
      v: [vx / (weight || 1), vy / (weight || 1), vz / (weight || 1)] as V3,
      t: t / (weight || 1),
      p: pressure / (weight || 1),
      solid: weight < 0.05,
    };
  }
  sample(p: V3) {
    if (!this.snapshot) return { v: [0, 0, 0] as V3, t: 27, p: 0, solid: false };
    const inside = p.every((v, i) => v >= this.g.origin[i] && v <= this.g.origin[i] + this.g.inner[i]);
    return this.fieldSample(inside ? this.snapshot.pc : this.snapshot.room, p);
  }
  seed(index: number) {
    let p: V3;
    if (this.customSeed && this.emitter === "point") p = [...this.customSeed];
    else if (this.emitter.startsWith("opening:")) {
      const o = this.config.room.openings.find((o) => o.id === this.emitter.slice(8));
      if (o) {
        const [rw, rh, rd] = this.config.room.size,
          along = o.along * (["left", "right"].includes(o.wall) ? rd : rw),
          y = o.sill + o.height / 2;
        p =
          o.wall === "left"
            ? [0.08, y, along]
            : o.wall === "right"
              ? [rw - 0.08, y, along]
              : o.wall === "front"
                ? [along, y, rd - 0.08]
                : [along, y, 0.08];
      } else p = [2, 1, 2];
    } else {
      let f = this.config.fans.find((f) => f.id === this.emitter);
      if (!f) {
        const ins = this.config.fans.filter((f) => f.enabled && f.intake);
        f = ins[Math.floor(Math.random() * ins.length)] || this.config.fans[0];
      }
      const m = this.g.mounts.find((m) => m.id === f?.mount);
      if (m) {
        // Seed one solver cell inside the case past the fan face: closer in, the wall cells carry almost no
        // velocity and outside the case the particle starts next to the solid PC block in the room grid.
        const f0 = this.snapshot?.pc,
          cell = f0 ? Math.max(...f0.size.map((s, i) => s / f0.n[i])) : 0.03;
        p = m.position.map((v, i) => v + this.g.origin[i] + m.normal[i] * (0.0125 + cell)) as V3;
      } else p = [this.g.origin[0] + 0.1, this.g.origin[1] + 0.1, this.g.origin[2] - 0.04];
      if (this.focusMode === "room" && this.emitter === "auto" && Math.random() < 0.45) {
        const exhaust = this.config.fans.filter((f) => f.enabled && !f.intake),
          f = exhaust[Math.floor(Math.random() * exhaust.length)],
          m = this.g.mounts.find((m) => m.id === f?.mount);
        if (m) p = m.position.map((v, i) => v + this.g.origin[i] - m.normal[i] * 0.05) as V3;
      }
    }
    const jitter = this.focusMode === "pc" ? 0.012 : 0.035;
    p = p.map((v) => v + (Math.random() - 0.5) * jitter) as V3;
    this.positions.set(p, index * 3);
    this.ages[index] = Math.random();
  }
  portal(p: V3, next: V3) {
    if (!this.snapshot) return next;
    const inside = p.every((v, i) => v >= this.g.origin[i] && v <= this.g.origin[i] + this.g.inner[i]);
    for (const f of this.config.fans) {
      if (!f.enabled || f.rpm <= 0) continue;
      const m = this.g.mounts.find((m) => m.id === f.mount);
      if (!m) continue;
      const pos = m.position.map((v, i) => v + this.g.origin[i]) as V3,
        d = Math.hypot(...p.map((v, i) => v - pos[i]));
      if (d < part(this.config, f.part).size[0] * 0.48 && ((inside && !f.intake) || (!inside && f.intake))) {
        const q = this.snapshot.stats.fanFlows.find((q) => q.id === f.id)?.q || 0;
        if (Math.abs(q) > 0.00001)
          return pos.map((v, i) => v + m.normal[i] * (q > 0 ? 0.04 : -0.07) + (Math.random() - 0.5) * 0.008) as V3;
      }
    }
    return next;
  }
  setSnapshot(data: Snapshot) {
    this.snapshot = data;
  }
  updateVectors() {
    if (!this.snapshot) return;
    this.disposeGroup(this.arrowGroup);
    const points: number[] = [],
      cols: number[] = [];
    const field = this.focusMode === "pc" ? this.snapshot.pc : this.snapshot.room,
      step = Math.max(1, Math.floor(Math.max(...field.n) / 10));
    for (let z = 1; z < field.n[2] - 1; z += step)
      for (let y = 1; y < field.n[1] - 1; y += step)
        for (let x = 1; x < field.n[0] - 1; x += step) {
          const k = x + field.n[0] * (y + field.n[1] * z);
          if (field.solid[k]) continue;
          const p: [number, number, number] = [
            field.origin[0] + ((x + 0.5) / field.n[0]) * field.size[0],
            field.origin[1] + ((y + 0.5) / field.n[1]) * field.size[1],
            field.origin[2] + ((z + 0.5) / field.n[2]) * field.size[2],
          ];
          if (this.focusMode === "pc" && (p[2] - field.origin[2]) / field.size[2] > this.slice) continue;
          if (this.arrows) {
            const v = new THREE.Vector3(...field.velocity.slice(k * 3, k * 3 + 3));
            if (v.length() > 0.005) {
              const arrow = new THREE.ArrowHelper(
                v.clone().normalize(),
                new THREE.Vector3(...p),
                this.focusMode === "pc" ? 0.028 : 0.13,
                0xc9e68d,
                this.focusMode === "pc" ? 0.006 : 0.035,
                0.015,
              );
              this.arrowGroup.add(arrow);
            }
          }
          if (this.overlay !== "flow") {
            const value = this.overlay === "temperature" ? field.temperature[k] : field.pressure[k],
              color = new THREE.Color().setHSL(
                this.overlay === "temperature"
                  ? clamp(0.65 - (value - 20) / 45, 0, 0.7)
                  : clamp(0.45 - value * 0.015, 0, 0.8),
                0.7,
                0.6,
              );
            points.push(...p);
            cols.push(color.r, color.g, color.b);
          }
        }
    this.sliceCloud.geometry.dispose();
    this.sliceCloud.geometry = new THREE.BufferGeometry();
    this.sliceCloud.geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    this.sliceCloud.geometry.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    (this.sliceCloud.material as THREE.Material)?.dispose();
    this.sliceCloud.material = new THREE.PointsMaterial({
      size: this.focusMode === "pc" ? 0.014 : 0.11,
      vertexColors: true,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const streamPoints: number[] = [];
    if (this.lines) {
      for (let i = 0; i < Math.min(28, this.density / 40); i++) {
        const k = i * 3,
          p0 = this.positions.slice(k, k + 3);
        let p = [...p0] as V3;
        for (let j = 0; j < 22; j++) {
          const v = this.sample(p),
            norm = Math.hypot(...v.v);
          if (v.solid || norm < 0.0002) break;
          const len = this.focusMode === "pc" ? 0.005 : 0.035,
            next = p.map((a, b) => a + (v.v[b] / norm) * len) as V3;
          streamPoints.push(...p, ...next);
          p = this.portal(p, next);
        }
      }
    }
    this.stream.geometry.dispose();
    this.stream.geometry = new THREE.BufferGeometry();
    this.stream.geometry.setAttribute("position", new THREE.Float32BufferAttribute(streamPoints, 3));
    (this.stream.material as THREE.Material)?.dispose();
    this.stream.material = new THREE.LineBasicMaterial({
      color: "#71dcec",
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
  }
  bind() {
    const el = this.renderer.domElement;
    let down = [0, 0];
    el.addEventListener("pointerdown", (e) => {
      down = [e.clientX, e.clientY];
      if (this.mode === "desk") this.controls.enabled = false;
    });
    el.addEventListener("pointerup", (e) => {
      this.controls.enabled = true;
      const r = el.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, (-(e.clientY - r.top) / r.height) * 2 + 1);
      this.ray.setFromCamera(this.pointer, this.camera);
      const c = clone(this.config);
      if (this.mode === "desk") {
        const p = new THREE.Vector3();
        if (this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) {
          c.desk.position[0] = p.x;
          c.desk.position[2] = p.z;
          this.onEdit(c);
        }
        return;
      }
      if (this.mode === "opening") {
        const o = c.room.openings[this.selectedOpening];
        if (!o) return;
        const normal =
            o.wall === "left" || o.wall === "right" ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1),
          constant = o.wall === "right" ? -c.room.size[0] : o.wall === "front" ? -c.room.size[2] : 0,
          p = new THREE.Vector3();
        if (this.ray.ray.intersectPlane(new THREE.Plane(normal, constant), p)) {
          o.along = clamp(normal.x ? p.z / c.room.size[2] : p.x / c.room.size[0], 0.05, 0.95);
          this.onEdit(c);
        }
        return;
      }
      if (this.mode === "smoke") {
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
            this.camera.getWorldDirection(new THREE.Vector3()),
            this.controls.target,
          ),
          p = new THREE.Vector3();
        if (this.ray.ray.intersectPlane(plane, p)) {
          this.customSeed = p.toArray() as V3;
          this.emitter = "point";
          this.ages.fill(100);
        }
        return;
      }
      if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) {
        const hit = this.ray.intersectObject(this.pcGroup, true);
        if (hit.length) this.focus("pc");
      }
    });
  }
  animate(now: number) {
    const dt = Math.min((now - this.last) / 1000 || 0.016, 0.035);
    this.last = now;
    if (this.transition) {
      this.camera.position.lerp(this.targetPos, 0.09);
      this.controls.target.lerp(this.targetLook, 0.09);
      if (this.camera.position.distanceTo(this.targetPos) < 0.005) this.transition = 0;
    }
    this.controls.update();
    this.pcGroup.traverse((o) => {
      if (o.userData.rpm) o.rotation.z += (dt * o.userData.rpm) / 60;
    });
    const n = Math.min(9000, this.density);
    this.points.geometry.setDrawRange(0, n);
    this.trails.geometry.setDrawRange(0, n * 2);
    this.points.visible = this.smoke;
    this.trails.visible = this.smoke;
    this.stream.visible = this.lines;
    if (this.snapshot && this.smoke) {
      for (let i = 0; i < n; i++) {
        if (this.ages[i] > 12 || this.ages[i] < 0) this.seed(i);
        const k = i * 3,
          p = Array.from(this.positions.slice(k, k + 3)) as V3,
          s = this.sample(p);
        let next = p.map((v, j) => v + s.v[j] * dt * (this.focusMode === "pc" ? 1 : 2)) as V3;
        next = this.portal(p, next);
        if (next.some((v, j) => v < 0 || v > this.config.room.size[j]) || s.solid || !next.every(Number.isFinite)) {
          this.ages[i] = 100;
          continue;
        }
        this.trailPos.set(p, i * 6);
        this.trailPos.set(next, i * 6 + 3);
        this.positions.set(next, k);
        const heat = clamp((s.t - this.config.room.ambient) / 12, 0, 1),
          pressure = clamp(s.p / 20, -1, 1);
        const col =
          this.overlay === "pressure"
            ? new THREE.Color().setHSL(0.4 - pressure * 0.25, 0.65, 0.65)
            : new THREE.Color().setRGB(0.3 + heat * 0.7, 0.85 - heat * 0.35, 1 - heat * 0.7);
        this.colors.set([col.r, col.g, col.b], k);
        this.ages[i] += dt;
        if (Math.hypot(...s.v) < 0.0005) this.ages[i] += dt * 3;
      }
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (this.trails.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    if (now - this.lastVectors > 700) {
      this.updateVectors();
      this.lastVectors = now;
    }
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame((t) => this.animate(t));
  }
}
