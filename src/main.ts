import "./style.css";
import { LabView } from "./view";
import { catalogue, byKind } from "./catalog";
import {
  clone,
  geometry,
  groupOf,
  issues,
  loadScene,
  makeCustom,
  normalize,
  part,
  preset,
  signature,
  syncCoolerFans,
} from "./config";
import type { SceneConfig, Kind, Part, Snapshot, V3, WorkerMessage } from "./types";
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (a) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[a]!,
  );
const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "—");
const signed = (v: number, d = 1) => (v > 0 ? "+" : "") + fmt(v, d);
const field = (
  id: string,
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  unit = "",
  type = "number",
) =>
  `<div class="field"><label for="${id}">${label}<output>${value}${unit}</output></label><input id="${id}" data-config="${id}" type="${type}" min="${min}" max="${max}" step="${step}" value="${value}"></div>`;
let config = loadScene(localStorage),
  revision = 0,
  lastSnapshot: Snapshot | null = null,
  baseline: SceneConfig | null = null,
  activeTab = "build",
  selectedFan = 0,
  selectedOpening = 0,
  gpuAvailable = false,
  paused = false,
  configureTimer: ReturnType<typeof setTimeout>,
  customKind: Kind = "gpu",
  currentCustom: Part | null = null,
  previewFrames = 0;
const history: { t: number; cpu: number; gpu: number; room: number }[] = [];
$("app").innerHTML =
  `<header><div class="brand">◌ AIRFLOW<span>LAB</span></div><small>CONFIGURE. FOLLOW THE AIR.</small><nav><button id="saveScene">Save</button><button id="loadScene">Load</button><button id="sources">Sources & limits</button><a href="https://github.com/Soba101/airflow-lab" target="_blank" rel="noopener">GitHub ↗</a></nav></header><main class="layout"><aside><div class="sideintro">YOUR BUILD IS THE STARTING POINT.</div><div class="field"><label for="preset">BUILD PRESET</label><select id="preset"><option value="h6">H6 Flow / RTX 5090 / H100i</option><option value="4000d">4000D / RTX 4080 / NH-U12A</option></select></div><div class="sidetabs"><button data-tab="build" class="active">Parts</button><button data-tab="room">Room</button><button data-tab="analysis">Analysis</button></div><div id="mobileWarning">Phone view uses a lighter smoke preview. Detailed runs are intended for capable desktop browsers.</div><div id="conflicts" class="notice" hidden></div><div id="buildPanel" class="sidepanel"></div><div id="roomPanel" class="sidepanel" hidden></div><div id="analysisPanel" class="sidepanel" hidden></div></aside><section class="scenearea"><div id="viewport"></div><div class="scene-top"><div class="viewbuttons"><button id="roomFocus" class="active">Room & desk</button><button id="caseFocus">Inside PC</button><button id="compare">＋ Baseline</button></div><div class="livebadge"><span class="dot"></span><span id="backend">INITIALIZING 3D SOLVER</span><small id="simTime">Browser-only · no account or server</small></div></div><div class="scene-title"><h1 id="sceneTitle">Give your build room to breathe.</h1><p id="sceneSubtitle">Orbit the scene. Click the PC to follow air through its components.</p></div><div id="initializing">Calculating a new airflow field…</div><details class="scene-tools"><summary>Airflow controls</summary><div class="field"><label for="emitter">RELEASE SMOKE AT</label><select id="emitter"></select></div><div class="field"><label for="density">SMOKE DENSITY</label><input id="density" type="range" min="200" max="6000" step="100" value="1800"></div><div class="field"><label for="overlay">COLOUR / OVERLAY</label><select id="overlay"><option value="flow">Air paths</option><option value="temperature">Air temperature · 20–65°C</option><option value="pressure">Relative pressure · Pa</option></select></div><label class="check"><input id="streamlines" type="checkbox" checked> Streamlines</label><label class="check"><input id="arrows" type="checkbox"> Flow arrows</label><label class="check"><input id="removePanels" type="checkbox"> Remove side panels</label><div class="field"><label for="slice">VISUAL DEPTH SLICE</label><input id="slice" type="range" min=".1" max="1" step=".05" value="1"></div><div class="compact"><button id="pointSmoke">Seed point</button><button id="pause">Pause</button></div></details><div id="compareBox" class="comparebox" hidden></div><div id="help" class="helpchip">Drag to orbit · Scroll to zoom. Cyan → amber smoke shows increasing air temperature. Airflow and temperatures remain model estimates.</div><div class="stats"><div class="stat"><small>CPU ESTIMATE</small><strong id="cpuStat">—</strong><span>Thermal model · current surrounding air</span></div><div class="stat"><small>GPU ESTIMATE</small><strong id="gpuStat">—</strong><span id="calStatus">Uncalibrated · whole-degree estimate</span></div><div class="stat"><small>CASE INTAKE</small><strong id="airStat">—</strong><span id="flowStat">Pressure–flow operating point</span></div><div class="stat"><small>RECENT EXHAUST AT INTAKE</small><strong id="recircStat">—</strong><span>Decaying tracer · not a validated metric</span></div></div><div class="bottomline"><div class="legend"><span><i></i>Air paths</span><span><i class="warm"></i>Warmer air</span></div><span id="qualityLabel">Model estimates · grid and boundary assumptions apply</span></div></section></main><dialog id="customDialog"><h2>Custom part</h2><div id="customBody"></div><div id="customError" class="notice" hidden></div><div class="modalactions"><button id="cancelCustom">Cancel</button><button id="applyCustom" class="primary">Use custom part</button></div></dialog><dialog id="sourceDialog"><h2>Evidence and simulation limits</h2><div id="sourcesBody"></div><div class="modalactions"><button id="closeSources">Close</button></div></dialog><dialog id="saveDialog"><h2>Save or load a scene</h2><div class="field"><label for="sceneName">NAME</label><input id="sceneName" type="text"></div><button id="saveLocal" class="primary">Save in this browser</button><select id="savedScenes" aria-label="Saved scenes"></select><div class="compact" style="margin-top:12px"><button id="restoreScene">Load selected</button><button id="exportScene">Export JSON</button><button id="importScene">Import JSON</button></div><input id="importFile" type="file" accept="application/json" hidden><div class="modalactions"><button id="closeSave">Close</button></div></dialog><div id="toast" class="toast" hidden role="status"></div>`;
let view: LabView;
try {
  view = new LabView($("viewport"), config);
} catch (error) {
  $("viewport").innerHTML =
    `<div class="browsererror"><h2>3D graphics could not start</h2><p>${esc(error)}</p><p>Enable hardware acceleration or use a WebGL2-capable desktop browser. No simulated result has been generated.</p></div>`;
  throw error;
}
const worker = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
const post = (message: WorkerMessage) => worker.postMessage(message);
function toast(text: string) {
  $("toast").textContent = text;
  $("toast").hidden = false;
  setTimeout(() => ($("toast").hidden = true), 6000);
}
function partSelector(kind: Exclude<Kind, "fan">, title: string) {
  const current = part(config, config.parts[kind]),
    options = [...byKind(kind), ...Object.values(config.custom).filter((p) => p.kind === kind)];
  return `<div class="part-row"><div class="field"><label for="part-${kind}">${title}</label><select id="part-${kind}" data-part="${kind}">${options.map((p) => `<option value="${esc(p.id)}" ${p.id === current.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div><div class="part-actions"><span class="evidence ${current.verified.length ? "" : "assumed"}">${current.verified.length ? "SOURCED ENVELOPE / ASSUMED MODEL" : "ASSUMED / CUSTOM"}</span><button data-custom="${kind}">Edit / custom</button></div><details class="part-evidence"><summary>Dimensions & evidence</summary><div class="hint">${current.size.map((v) => Math.round(v * 1000)).join(" × ")} mm${specSummary(current)}${current.note ? " · " + esc(current.note) : ""}</div>${current.source ? `<a class="source" target="_blank" rel="noopener" href="${esc(current.source)}">Manufacturer evidence ↗</a>` : ""}</details></div>`;
}
function renderBuild() {
  const g = geometry(config),
    cooler = part(config, config.parts.cooler),
    f = config.fans[selectedFan],
    fp = f ? part(config, f.part) : null;
  $("buildPanel").innerHTML =
    `${(["case", "gpu", "board", "cpu", "ram", "storage", "cooler"] as const).map((k, i) => partSelector(k, ["CASE", "GRAPHICS CARD", "MOTHERBOARD", "CPU", "RAM", "STORAGE", "CPU COOLER"][i])).join("")}<div class="field"><label for="gpuSlot">MOTHERBOARD PCIe SLOT</label><select id="gpuSlot">${(part(config, config.parts.board).slots || [0.205]).map((s, i) => `<option value="${i}" ${i === config.slot ? "selected" : ""}>${i ? "Secondary (reduced lanes)" : "Primary PCIEX16"} · board-fixed</option>`).join("")}</select></div>${cooler.coolerType === "aio" ? `<div class="field"><label for="radiatorMount">RADIATOR POSITION</label><select id="radiatorMount">${[...new Set(g.mounts.filter((m) => m.radiator).map((m) => groupOf(m.id)))].map((grp) => `<option value="${esc(grp)}" ${config.radiatorMount === grp ? "selected" : ""}>${esc(grp[0].toUpperCase() + grp.slice(1))} · ${g.mounts.filter((m) => m.radiator && groupOf(m.id) === grp).length} fan positions</option>`).join("")}${g.mounts.some((m) => m.radiator && groupOf(m.id) === config.radiatorMount) ? "" : `<option selected value="${esc(config.radiatorMount)}">${esc(config.radiatorMount)} (not in this case)</option>`}</select></div>` : field("coolerRPM", "COOLER FAN SPEED", config.coolerFanRPM, 0, part(config, cooler.fanPart || "p12").maxRPM || 2000, 50, " RPM", "range")}<div class="sectionhead">Fan layout</div><div class="hint">Select a model and a valid mount. Changing cases retains your choices and reports incompatible mounts.</div><button class="blockbutton" id="compatibleLayout">Apply this case’s compatible starter layout</button><div class="field"><label for="fanSelect">SELECT FAN</label><select id="fanSelect">${config.fans.map((f, i) => `<option value="${i}" ${selectedFan === i ? "selected" : ""}>${esc(f.mount)} · ${esc(part(config, f.part).name)}</option>`).join("")}</select></div>${f && fp ? `<div class="field"><label for="fanModel">FAN MODEL</label><select id="fanModel">${[...byKind("fan"), ...Object.values(config.custom).filter((p) => p.kind === "fan")].map((p) => `<option value="${p.id}" ${p.id === f.part ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div><div class="field"><label for="fanMount">SNAP TO MOUNT</label><select id="fanMount">${!g.mounts.find((m) => m.id === f.mount) ? `<option value="${f.mount}">${f.mount} (invalid)</option>` : ""}${g.mounts.map((m) => `<option value="${m.id}" ${m.id === f.mount ? "selected" : ""}>${m.name} · ${m.sizes.join("/")} mm</option>`).join("")}</select></div>${field("fanRPM", "SPEED", f.rpm, 0, fp.maxRPM || 3000, 50, " RPM", "range")}<div class="compact"><button id="flipFan">${f.intake ? "Intake → flip" : "Exhaust → flip"}</button><button id="toggleFan">${f.enabled ? "Enabled" : "Disabled"}</button><button id="deleteFan">Remove</button></div><div class="hint">${esc(fp.curveStatus || "Custom measured curve when supplied; otherwise estimated.")}</div><button data-custom="fan" class="blockbutton">Custom fan / measured P–Q curve</button>` : ""}<button id="addFan" class="blockbutton">＋ Add fan</button><div class="sectionhead">Workload, not TDP</div>${field("cpuW", "CPU PACKAGE", config.load.cpu, 0, 250, 5, " W", "range")}${field("gpuW", "GPU ELECTRICAL", config.load.gpu, 0, 800, 5, " W", "range")}${field("otherW", "OTHER SYSTEM / FAN HEAT", config.load.other, 0, 300, 5, " W", "range")}<p class="hint">Component estimates use thermal resistance/capacitance models. Manufacturer TDP and cooler dimensions do not establish thermal accuracy.</p>`;
}
function renderRoom() {
  const r = config.room,
    d = config.desk,
    o = r.openings[selectedOpening];
  $("roomPanel").innerHTML =
    `<div class="sectionhead">Room geometry</div><div class="threecols">${field("roomX", "WIDTH", r.size[0], 2, 8, 0.1, " m")}${field("roomZ", "DEPTH", r.size[2], 2, 8, 0.1, " m")}${field("roomY", "HEIGHT", r.size[1], 2, 4, 0.1, " m")}</div>${field("ambient", "INITIAL ROOM AIR", r.ambient, 10, 40, 0.5, "°C", "range")}${field("outside", "OUTDOOR AIR", r.outside, 0, 45, 0.5, "°C", "range")}${field("adjacent", "ADJACENT SPACE AIR", r.adjacent, 0, 45, 0.5, "°C", "range")}${field("wallUA", "ENVELOPE CONDUCTANCE", r.wallUA, 0, 200, 5, " W/K")}${field("exchange", "PRESCRIBED OPENING EXCHANGE", r.exchange, 0, 15, 0.25, " ACH")}<p class="hint">Open area distributes a prescribed total exchange, scaled by open fraction. This is not a wind-pressure prediction. Buoyancy acts within the 3D domains.</p><div class="sectionhead">Desk + PC together</div><div class="compact">${field("deskX", "X POSITION", d.position[0], 0.5, r.size[0] - 0.5, 0.1, " m")}${field("deskZ", "Z POSITION", d.position[2], 0.5, r.size[2] - 0.5, 0.1, " m")}</div><div class="threecols">${field("deskW", "WIDTH", d.width, 0.8, 3, 0.1, " m")}${field("deskD", "DEPTH", d.depth, 0.4, 1.2, 0.05, " m")}${field("deskH", "HEIGHT", d.height, 0.6, 1.1, 0.05, " m")}</div><button class="blockbutton" id="moveDesk">Place setup on floor with a click</button><div class="field"><label for="placement">PC PLACEMENT</label><select id="placement">${(["deskLeft", "deskRight", "underLeft", "underRight", "floorLeft", "floorRight"] as const).map((p, i) => `<option value="${p}" ${p === config.pc.placement ? "selected" : ""}>${["On desk · left", "On desk · right", "Under desk · left", "Under desk · right", "Beside desk · floor left", "Beside desk · floor right"][i]}</option>`).join("")}</select></div><div class="hint">Tabletop is a 3D obstacle. Changing placement changes case height and the surrounding flow.</div><div class="sectionhead">Windows and doors</div><div class="compact"><button id="newWindow">＋ Window</button><button id="newDoor">＋ Door</button></div><div class="field"><label for="openingSelect">SELECT OPENING</label><select id="openingSelect">${r.openings.map((o, i) => `<option value="${i}" ${i === selectedOpening ? "selected" : ""}>${esc(o.type)} ${i + 1} · ${esc(o.wall)}</option>`).join("")}</select></div>${o ? `<div class="field"><label for="openingWall">WALL</label><select id="openingWall">${["left", "right", "front", "back"].map((w) => `<option ${w === o.wall ? "selected" : ""}>${w}</option>`).join("")}</select></div>${field("openingAlong", "POSITION ALONG WALL", Math.round(o.along * 100), 5, 95, 1, "%", "range")}<div class="compact">${field("openingWidth", "WIDTH", o.width, 0.3, 2.4, 0.05, " m")}${field("openingHeight", "HEIGHT", o.height, 0.2, r.size[1] - 0.05, 0.05, " m")}</div>${field("openingSill", "SILL ABOVE FLOOR", o.sill, 0, r.size[1] - 0.3, 0.05, " m")}${field("openingOpen", "HOW OPEN", Math.round(o.open * 100), 0, 100, 5, "%", "range")}<div class="compact"><button id="placeOpening">Position on wall with a click</button><button id="deleteOpening">Remove</button></div>` : '<p class="hint">No openings: prescribed ventilation is zero.</p>'}`;
}
function renderAnalysis() {
  const a = config.analysis;
  $("analysisPanel").innerHTML =
    `<div class="sectionhead">Detailed browser analysis</div><div id="capability" class="notice">${gpuAvailable ? "WebGPU available. Pressure solve is GPU-accelerated; transport and thermal models run in the worker." : "Checking WebGPU… Coarse 3D worker preview is available without it."}</div><div class="field"><label for="runQuality">SPATIAL QUALITY</label><select id="runQuality"><option value="draft" ${a.quality === "draft" ? "selected" : ""}>Draft · lower resolution</option><option value="balanced" ${a.quality === "balanced" ? "selected" : ""}>Balanced · default</option><option value="fine" ${a.quality === "fine" ? "selected" : ""}>Fine · higher memory / longer run</option></select></div><div class="field"><label for="timeBudget">WALL-CLOCK BUDGET</label><select id="timeBudget">${[
      [30, "30 seconds"],
      [120, "2 minutes"],
      [300, "5 minutes"],
      [600, "10 minutes"],
      [0, "Until converged"],
      [-1, "Custom…"],
    ]
      .map(([v, name]) => `<option value="${v}" ${v === a.seconds ? "selected" : ""}>${name}</option>`)
      .join(
        "",
      )}</select></div>${field("customBudget", "CUSTOM SECONDS (0 = UNTIL CONVERGED)", a.seconds, 0, 3600, 5, " s")}<label class="check"><input id="gridCheck" type="checkbox" ${a.gridCheck ? "checked" : ""}> Compare coarse / selected resolution</label><div class="compact"><button id="runDetailed" class="primary" ${gpuAvailable ? "" : "disabled"}>Run analysis</button><button id="cancelRun">Cancel</button></div><div id="runStatus" class="analysis-status">Live preview. Detailed results will report progress and convergence.</div><div class="progress"><i id="runProgress"></i></div><div id="diagnostics" class="metric-list"></div><div class="hint">Run time depends on the device. Wall-clock budget is not simulated time. Results may remain incomplete when the budget expires. A low residual is a numerical check, not physical validation.</div><div class="sectionhead">Calibration profiles</div><div class="field"><label for="calSelect">ACTIVE PROFILE</label><select id="calSelect"><option value="">Uncalibrated model</option>${config.calibrations.map((p) => `<option value="${esc(p.id)}" ${p.id === config.activeCalibration ? "selected" : ""}>${esc(p.id)} ${p.signature === signature(config) ? "" : "(different hardware)"}</option>`).join("")}</select></div><details><summary>Add a measured operating point</summary><p class="hint">Use a stable measured workload and average fan RPM. Profile only applies to the same part/mount configuration within ±25% power/RPM and ±5°C ambient. Single-point calibration is not independent validation.</p>${field("calAmbient", "MEASURED AMBIENT", config.room.ambient, 0, 45, 0.5, "°C")}${field("calCpuW", "MEASURED CPU POWER", config.load.cpu, 1, 250, 1, " W")}${field("calGpuW", "MEASURED GPU POWER", config.load.gpu, 1, 800, 1, " W")}${field("calRPM", "AVERAGE CASE FAN RPM", 1200, 100, 3500, 50, " RPM")}${field("calCPU", "MEASURED CPU TEMPERATURE", 65, 10, 110, 1, "°C")}${field("calGPU", "MEASURED GPU CORE TEMPERATURE", 75, 10, 110, 1, "°C")}<button class="blockbutton" id="addCalibration">Fit and save profile</button><div class="hint">A lumped resistance is fitted after subtracting the current estimated inlet rise. Use matching ambient/load conditions; estimates remain uncertain.</div></details><canvas id="historyChart" width="250" height="110" style="width:100%;height:110px" aria-label="CPU and GPU estimate history"></canvas>`;
  updateMetrics();
}
function renderPanels() {
  renderBuild();
  renderRoom();
  renderAnalysis();
  const e = $<HTMLSelectElement>("emitter"),
    old = e.value;
  e.innerHTML = `<option value="auto">Intakes + exhaust · auto</option>${config.fans
    .filter((f) => f.enabled)
    .map((f) => `<option value="${esc(f.id)}">Fan: ${esc(f.mount)}</option>`)
    .join(
      "",
    )}${config.room.openings.map((o) => `<option value="opening:${o.id}">${o.type}: ${o.wall} wall</option>`).join("")}<option value="point">Point in space</option>`;
  e.value = [...e.options].some((o) => o.value === old) ? old : "auto";
  view.emitter = e.value;
  showTab(activeTab);
  $<HTMLInputElement>("removePanels").checked = config.panelsOpen;
}
function showTab(tab: string) {
  activeTab = tab;
  for (const t of ["build", "room", "analysis"]) {
    $(t + "Panel").hidden = t !== tab;
    document.querySelector(`[data-tab="${t}"]`)?.classList.toggle("active", tab === t);
  }
}
function apply(c: SceneConfig, redraw = true) {
  try {
    config = normalize(c);
  } catch (e) {
    toast(String(e));
    return;
  }
  revision++;
  lastSnapshot = null;
  for (const id of ["cpuStat", "gpuStat", "airStat", "recircStat"]) $(id).textContent = "—";
  $("flowStat").textContent = "Recalculating";
  history.length = 0;
  view.snapshot = null;
  view.build(config);
  const warnings = issues(config);
  $("conflicts").hidden = !warnings.length;
  $("conflicts").innerHTML = warnings.map((w) => "• " + esc(w)).join("<br>");
  $("initializing").hidden = !!warnings.length;
  try {
    localStorage.setItem("airflow-scene-v2", JSON.stringify(config));
  } catch {
    toast("Browser storage is full; export the scene to retain your settings.");
  }
  post({ type: "configure", config, revision, baseline });
  if (redraw) renderPanels();
}
function schedule() {
  clearTimeout(configureTimer);
  configureTimer = setTimeout(() => apply(config), 250);
}
view.onEdit = (c) => {
  view.mode = "orbit";
  apply(c);
  toast("Placement updated. Flow is recalculating.");
};
view.onFocus = (mode) => {
  $("roomFocus").classList.toggle("active", mode === "room");
  $("caseFocus").classList.toggle("active", mode === "pc");
  $("sceneTitle").textContent =
    mode === "room" ? "Give your build room to breathe." : part(config, config.parts.case).name;
  $("sceneSubtitle").textContent =
    mode === "room"
      ? "Orbit the scene. Click the PC to follow air through its components."
      : `${part(config, config.parts.gpu).name} · ${part(config, config.parts.cooler).name}`;
};
function updateMetrics() {
  if (!lastSnapshot) return;
  const s = lastSnapshot.stats;
  $("cpuStat").textContent = fmt(s.cpu, 0) + "°C";
  $("gpuStat").textContent = fmt(s.gpu, 0) + "°C";
  $("calStatus").textContent = s.calibrated
    ? "Calibrated within profile range · estimate"
    : "Uncalibrated · model estimate";
  $("airStat").textContent = fmt(s.intake) + "°C";
  $("flowStat").textContent = fmt(s.flow * 3600, 0) + " m³/h · installed-flow estimate";
  $("recircStat").textContent = fmt(s.recirculation * 100, 0) + "%";
  $("backend").textContent = lastSnapshot.backend.includes("WebGPU") ? "WEBGPU + 3D WORKER" : "3D WORKER PREVIEW";
  $("simTime").textContent = `${fmt(s.time, 1)} s simulated · ${s.steps} steps`;
  $("qualityLabel").textContent =
    `Case grid ${lastSnapshot.pc.n.join("×")} · Room ${lastSnapshot.room.n.join("×")} · ${s.calibrated ? "Calibrated estimate" : "Uncalibrated estimate"}`;
  if ($("diagnostics"))
    $("diagnostics").innerHTML =
      `Pressure residual <b>${s.pressureResidual.toExponential(2)}</b><br>Max divergence <b>${s.divergence.toExponential(2)} s⁻¹</b><br>Port mass imbalance <b>${s.massError.toExponential(2)} m³/s</b><br>Interface heat residual <b>${s.couplingError.toExponential(2)} W</b><br>Energy budget residual <b>${s.energyError.toExponential(2)} J</b><br>Transient CPU / GPU <b>${fmt(s.cpuTransient ?? 0)} / ${fmt(s.gpuTransient ?? 0)}°C</b><br>Room mean <b>${fmt(s.room)}°C</b>`;
  const a = lastSnapshot.analysis;
  if ($("runStatus")) {
    $("runStatus").textContent = a
      ? `${a.state.toUpperCase()} · ${fmt(a.elapsed, 0)} s wall time${a.gridDelta !== undefined ? " · coarse/fine Δ " + fmt(a.gridDelta) + "°C" : ""}. ${a.reason || "Computing velocity, heat and component models…"}`
      : "Live preview. Detailed analysis starts a fresh run at the chosen resolution.";
    $("runProgress").style.width = (a?.progress || 0) * 100 + "%";
  }
  if (lastSnapshot.baseline) {
    const b = lastSnapshot.baseline;
    $("compareBox").hidden = false;
    $("compareBox").innerHTML =
      `<b>BASELINE COMPARISON</b><br>CPU ${signed(s.cpu - b.cpu, 0)}°C · GPU ${signed(s.gpu - b.gpu, 0)}°C<br>Intake ${signed(s.intake - b.intake)}°C · installed flow ${signed((s.flow - b.flow) * 3600, 0)} m³/h<br><small>Matched load, temperatures, resolution and elapsed time. ${Math.abs(s.time - b.time) > 0.01 ? "⚠ Time mismatch; results are not comparable." : ""}</small>`;
  } else $("compareBox").hidden = true;
  drawHistory();
}
function drawHistory() {
  const can = $<HTMLCanvasElement>("historyChart");
  if (!can || history.length < 2) return;
  const ctx = can.getContext("2d")!;
  ctx.clearRect(0, 0, 250, 110);
  const vals = history.flatMap((v) => [v.cpu, v.gpu, v.room]),
    lo = Math.floor(Math.min(...vals) - 2),
    hi = Math.ceil(Math.max(...vals) + 2),
    end = Math.max(1, history.at(-1)!.t);
  ctx.font = "8px monospace";
  for (let i = 0; i < 3; i++) {
    const y = 10 + i * 40;
    ctx.strokeStyle = "#40573e";
    ctx.beginPath();
    ctx.moveTo(25, y);
    ctx.lineTo(248, y);
    ctx.stroke();
    ctx.fillStyle = "#9bac91";
    ctx.fillText(fmt(hi - ((hi - lo) * i) / 2, 0) + "°", 0, y + 3);
  }
  for (const [k, color] of [
    ["cpu", "#c6ef85"],
    ["gpu", "#eebc87"],
    ["room", "#85bbdb"],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    history.forEach((v, i) => {
      const x = 25 + (v.t / end) * 220,
        y = 10 + ((hi - v[k]) / (hi - lo)) * 80;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  }
  ctx.fillStyle = "#a0b498";
  ctx.fillText("CPU / GPU / room · simulated time", 25, 108);
}
worker.onmessage = (e) => {
  const m = e.data;
  if (m.type === "snapshot") {
    if (m.data.revision !== revision) return;
    lastSnapshot = m.data;
    view.setSnapshot(m.data);
    $("initializing").hidden = true;
    history.push({ t: m.data.stats.time, cpu: m.data.stats.cpu, gpu: m.data.stats.gpu, room: m.data.stats.room });
    if (history.length > 300) history.splice(1, 1);
    updateMetrics();
  } else if (m.type === "capability") {
    gpuAvailable = m.webgpu;
    const active = document.activeElement?.id;
    if (activeTab === "analysis" && !active?.startsWith("cal")) renderAnalysis();
    if (!gpuAvailable && $("capability"))
      $("capability").textContent = m.reason || "WebGPU unavailable. Worker preview remains available.";
  } else if (m.type === "invalid") {
    $("conflicts").hidden = false;
    $("conflicts").textContent = m.messages.join(" ");
    $("initializing").hidden = true;
  } else if (m.type === "error") {
    toast(m.message);
    $("initializing").hidden = true;
    if ($("runStatus")) $("runStatus").textContent = m.message;
  }
};
function showSources() {
  const selected = Object.values(config.parts).map((id) => part(config, id));
  $("sourcesBody").innerHTML =
    `<p>This is a browser-based engineering-style model, not a validated temperature predictor. Smoke follows 3D projected velocity fields. The worker uses simplified momentum/heat transport, porous drag, fan pressure models and two-way case/room port exchange. Geometry, loss coefficients and thermal resistances are uncertain.</p><p>CPU/GPU headline values are component equilibrium estimates for the current calculated local air, derived from thermal resistance models. The diagnostics separately show transient thermal-node temperatures. A steady component estimate does not establish room thermal equilibrium.</p><p>Fan curves are fitted from published endpoints unless a measured custom curve is provided. Window/door flow is prescribed exchange, not an external wind simulation. Fine fins, wires, filters and fan blades are sub-grid/porous approximations. Wall heat capacity, humidity, solar gains and validated turbulence are omitted.</p><p>Evidence is per property, not a blanket claim that a part is fully verified. Internal mount coordinates remain approximate. Numerical checks test conservation and references, not agreement with your real build.</p><div class="source-list">${selected.map((p) => `<article><b>${esc(p.name)}</b><br>${p.size.map((v) => Math.round(v * 1000)).join(" × ")} mm<br>${p.verified.length ? esc(p.verified.join(" · ")) : "User-defined / assumed envelope"}<small>${esc(p.note || "Thermal performance requires a calibrated model.")}</small>${p.source?.startsWith("https://") ? `<a href="${esc(p.source)}" target="_blank" rel="noopener">Manufacturer source ↗</a>` : ""}</article>`).join("")}</div>`;
  $<HTMLDialogElement>("sourceDialog").showModal();
}
function specSummary(p: Part) {
  const fans = p.fanCount
    ? `${p.fanCount} × ${Math.round((p.fanSize || part(config, p.fanPart || "p12").size[0]) * 1000)} mm fans`
    : "";
  if (p.kind === "gpu") return ` · ${fans}${p.flowThrough ? " · flow-through" : ""}`;
  if (p.kind === "cooler")
    return p.coolerType === "aio"
      ? ` · ${Math.round(p.size[0] * 1000)} mm radiator, ${Math.round(p.size[1] * 1000)} mm thick · ${fans}`
      : ` · ${p.towers === 2 ? "dual" : "single"} tower · ${fans}`;
  return "";
}
const sizeLabels: Partial<Record<Kind, string[]>> = {
  case: ["DEPTH", "HEIGHT", "WIDTH"],
  gpu: ["LENGTH", "THICKNESS", "HEIGHT"],
  board: ["WIDTH", "HEIGHT", "PCB"],
  fan: ["SIZE", "THICKNESS", "SIZE"],
};
function editCustom(kind: Kind) {
  customKind = kind;
  currentCustom = makeCustom(
    config,
    kind,
    kind === "fan" ? config.fans[selectedFan]?.part || "a12" : config.parts[kind],
  );
  const p = currentCustom;
  $("customBody").innerHTML =
    `<div class="field"><label for="customName">NAME</label><input type="text" id="customName" value="${esc(p.name)}"></div><div class="threecols">${p.size.map((v, i) => field(`custom${i}`, (kind === "cooler" ? (p.coolerType === "aio" ? ["RADIATOR LENGTH", "RADIATOR THICKNESS", "RADIATOR WIDTH"] : ["DEPTH WITH FANS", "WIDTH", "HEIGHT"]) : sizeLabels[kind] || ["X / LENGTH", "Y / HEIGHT", "Z / DEPTH"])[i], Math.round(v * 1000), 1, 2000, 1, " mm")).join("")}</div>${specFields(p)}${field("customR", "TOTAL THERMAL RESISTANCE", p.resistance || 0.15, 0.02, 2, 0.01, " K/W")}${field("customCapacity", "THERMAL CAPACITY", p.capacity || 500, 10, 5000, 10, " J/K")}${kind === "fan" ? `${field("customRPM", "MAX RPM", p.maxRPM || 2000, 100, 5000, 50)}${field("customCFM", "FREE AIRFLOW", p.cfm || 60, 1, 250, 1, " CFM")}${field("customPressure", "SHUTOFF PRESSURE", p.pressure || 20, 1, 200, 1, " Pa")}<div class="field"><label for="customCurve">MEASURED CURVE: FRACTION OF RATED FLOW, PA</label><textarea id="customCurve" placeholder="0, 30&#10;0.5, 20&#10;1, 0"></textarea></div>` : ""}${kind === "case" ? `<div class="field"><label for="customMounts">MOUNT ARRAY (METRES; NORMAL POINTS INWARD)</label><textarea id="customMounts">${esc(JSON.stringify(p.mounts, null, 2))}</textarea></div><p class="hint">Inherited coordinates stay fixed until you edit them. Size changes do not silently rearrange mounts.</p>` : ""}${kind === "board" ? `<div class="field"><label for="customSlots">PCIe x16 SLOT CENTRELINES BELOW BOARD TOP EDGE · mm</label><input id="customSlots" value="${(p.slots || [0.19]).map((v) => Math.round(v * 1000)).join(", ")}"></div>` : ""}<p class="hint">Custom values are user assumptions/measurements. Thermal capacity/resistance are used by the lumped model where applicable. Case loss and detailed fins remain estimated.</p>`;
  $("customError").hidden = true;
  $<HTMLDialogElement>("customDialog").showModal();
}
const fanOptions = (selected?: string) =>
  [...byKind("fan"), ...Object.values(config.custom).filter((p) => p.kind === "fan")]
    .map((f) => `<option value="${esc(f.id)}" ${f.id === selected ? "selected" : ""}>${esc(f.name)}</option>`)
    .join("");
function specFields(p: Part) {
  const mmField = (id: string, label: string, v: number | undefined, def: number) =>
    field(id, label, Math.round((v ?? def) * 1000), 0, 1000, 1, " mm");
  if (p.kind === "gpu")
    return `<div class="threecols">${field("customFans", "FANS", p.fanCount ?? 2, 0, 4, 1)}${mmField("customFanSize", "FAN DIAMETER", p.fanSize, 0.09)}</div><label class="check"><input id="customFlow" type="checkbox" ${p.flowThrough ? "checked" : ""}> Flow-through heatsink (short PCB, air exits the top)</label>`;
  if (p.kind === "cooler")
    return `<div class="threecols">${field("customFans", "FANS", p.fanCount ?? 2, 0, 4, 1)}${p.coolerType === "air" ? `${field("customTowers", "TOWERS", p.towers ?? 1, 1, 2, 1)}${mmField("customFin", "FIN DEPTH (NO FANS)", p.finDepth, 0.06)}${mmField("customFinStart", "FINS START ABOVE BOARD", p.finStart, 0.04)}` : ""}</div><div class="field"><label for="customFanPart">SUPPLIED FAN MODEL</label><select id="customFanPart">${fanOptions(p.fanPart)}</select></div>`;
  if (p.kind === "case")
    return `<div class="threecols">${mmField("customChamber", "GLASS TO TRAY", p.chamber, p.size[2] - 0.025)}${mmField("customShroud", "PSU SHROUD HEIGHT", p.shroud, 0)}${mmField("customGpuMax", "MAX GPU LENGTH", p.clearance, p.size[0] - 0.05)}${mmField("customCoolerMax", "MAX COOLER HEIGHT", p.coolerClearance, 0.16)}</div>`;
  return "";
}
function saveCustom() {
  if (!currentCustom) return;
  try {
    const p = currentCustom;
    p.name = $<HTMLInputElement>("customName").value.trim() || "Custom part";
    p.size = [0, 1, 2].map((i) => +$<HTMLInputElement>("custom" + i).value / 1000) as V3;
    p.resistance = +$<HTMLInputElement>("customR").value;
    p.capacity = +$<HTMLInputElement>("customCapacity").value;
    if (p.kind === "fan") {
      p.maxRPM = +$<HTMLInputElement>("customRPM").value;
      p.cfm = +$<HTMLInputElement>("customCFM").value;
      p.pressure = +$<HTMLInputElement>("customPressure").value;
      const raw = $<HTMLTextAreaElement>("customCurve").value.trim();
      if (raw) {
        const rows = raw.split("\n").map((r) => r.split(",").map(Number));
        if (
          rows.length < 2 ||
          rows.some((r) => r.length !== 2 || !r.every(Number.isFinite) || r[0] < 0 || r[0] > 2 || r[1] < 0) ||
          rows.some((r, i) => i && r[0] <= rows[i - 1][0])
        )
          throw new Error("Curve needs increasing nonnegative flow fractions and nonnegative pressure values.");
        p.curve = rows as [number, number][];
        p.curveStatus = "User-entered measured pressure curve.";
      }
    }
    const num = (id: string) => +$<HTMLInputElement>(id).value;
    if (p.kind === "gpu") {
      p.fanCount = num("customFans");
      p.fanSize = num("customFanSize") / 1000;
      p.flowThrough = $<HTMLInputElement>("customFlow").checked;
    }
    if (p.kind === "cooler") {
      p.fanCount = num("customFans");
      p.fanPart = $<HTMLSelectElement>("customFanPart").value;
      if (p.coolerType === "air") {
        p.towers = num("customTowers");
        p.finDepth = num("customFin") / 1000;
        p.finStart = num("customFinStart") / 1000;
      }
    }
    if (p.kind === "case") {
      p.chamber = num("customChamber") / 1000;
      p.shroud = num("customShroud") / 1000;
      p.clearance = num("customGpuMax") / 1000;
      p.coolerClearance = num("customCoolerMax") / 1000;
      p.mounts = JSON.parse($<HTMLTextAreaElement>("customMounts").value);
      if (
        !Array.isArray(p.mounts) ||
        p.mounts.some((m) => !m.id || m.position.length !== 3 || m.normal.length !== 3 || m.sizes.length < 1)
      )
        throw new Error("Invalid mount array.");
    }
    if (p.kind === "board") {
      p.slots = $<HTMLInputElement>("customSlots")
        .value.split(",")
        .map((v) => +v.trim() / 1000);
      if (p.slots.some((v) => !Number.isFinite(v) || v <= 0)) throw new Error("Invalid slot heights.");
    }
    config.custom[p.id] = p;
    if (p.kind === "fan") config.fans[selectedFan].part = p.id;
    else config.parts[p.kind] = p.id;
    const normalized = syncCoolerFans(normalize(config));
    $<HTMLDialogElement>("customDialog").close();
    apply(normalized);
  } catch (error) {
    $("customError").textContent = String(error);
    $("customError").hidden = false;
  }
}
function saved() {
  try {
    return JSON.parse(localStorage.getItem("airflow-scenes-v2") || "[]") as SceneConfig[];
  } catch {
    return [];
  }
}
function openSave() {
  const rows = saved();
  $<HTMLInputElement>("sceneName").value = config.name;
  $("savedScenes").innerHTML = rows.map((r, i) => `<option value="${i}">${esc(r.name)}</option>`).join("");
  $<HTMLDialogElement>("saveDialog").showModal();
}
function configNumber(id: string, v: number) {
  const c = config,
    d = c.desk,
    r = c.room,
    o = r.openings[selectedOpening];
  if (id === "fanRPM") {
    if (c.fans[selectedFan]) c.fans[selectedFan].rpm = v;
  } else if (id === "cpuW") c.load.cpu = v;
  else if (id === "gpuW") c.load.gpu = v;
  else if (id === "otherW") c.load.other = v;
  else if (id === "coolerRPM") c.coolerFanRPM = v;
  else if (id.startsWith("room")) {
    const axis = { roomX: 0, roomY: 1, roomZ: 2 }[id];
    if (axis !== undefined) r.size[axis] = v;
  } else if (["ambient", "outside", "adjacent", "wallUA", "exchange"].includes(id)) (r as any)[id] = v;
  else if (id === "deskX") d.position[0] = v;
  else if (id === "deskZ") d.position[2] = v;
  else if (id === "deskW") d.width = v;
  else if (id === "deskD") d.depth = v;
  else if (id === "deskH") d.height = v;
  else if (o && id.startsWith("opening")) {
    if (id === "openingAlong") o.along = v / 100;
    if (id === "openingWidth") o.width = v;
    if (id === "openingHeight") o.height = v;
    if (id === "openingSill") o.sill = v;
    if (id === "openingOpen") o.open = v / 100;
  } else return;
  schedule();
}
document.addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement;
  if (el.matches("[data-config]") && !el.id.startsWith("cal") && !el.id.startsWith("custom")) {
    const out = el.parentElement?.querySelector("output");
    if (out) out.textContent = el.value;
    configNumber(el.id, +el.value);
  }
  if (el.id === "density") view.density = +el.value;
  if (el.id === "slice") {
    view.slice = +el.value;
    view.applySlice();
  }
});
document.addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement;
  if (el.dataset.part) {
    config.parts[el.dataset.part as keyof SceneConfig["parts"]] = el.value;
    // Keep the AIO on a radiator position this case actually has, then put its own fans on that radiator.
    const groups = (part(config, config.parts.case).mounts || []).filter((m) => m.radiator).map((m) => groupOf(m.id));
    if (groups.length && !groups.includes(config.radiatorMount))
      config.radiatorMount = groups.includes("top") ? "top" : groups[0];
    apply(syncCoolerFans(config));
  }
  switch (el.id) {
    case "preset":
      selectedFan = 0;
      apply(preset(el.value));
      break;
    case "gpuSlot":
      config.slot = +el.value;
      apply(config);
      break;
    case "radiatorMount":
      config.radiatorMount = el.value;
      apply(syncCoolerFans(config));
      break;
    case "fanSelect":
      selectedFan = +el.value;
      renderBuild();
      break;
    case "fanModel":
      config.fans[selectedFan].part = el.value;
      apply(config);
      break;
    case "fanMount":
      config.fans[selectedFan].mount = el.value;
      apply(config);
      break;
    case "placement":
      config.pc.placement = el.value as any;
      apply(config);
      break;
    case "openingSelect":
      selectedOpening = +el.value;
      view.selectedOpening = selectedOpening;
      renderRoom();
      break;
    case "openingWall":
      config.room.openings[selectedOpening].wall = el.value as any;
      apply(config);
      break;
    case "runQuality":
      config.analysis.quality = el.value as any;
      break;
    case "timeBudget":
      if (+el.value >= 0) config.analysis.seconds = +el.value;
      else config.analysis.seconds = +$<HTMLInputElement>("customBudget").value;
      $<HTMLInputElement>("customBudget").value = String(config.analysis.seconds);
      break;
    case "customBudget":
      config.analysis.seconds = +el.value;
      break;
    case "gridCheck":
      config.analysis.gridCheck = el.checked;
      break;
    case "calSelect":
      config.activeCalibration = el.value || null;
      apply(config);
      break;
    case "emitter":
      view.emitter = el.value;
      view.ages.fill(100);
      break;
    case "overlay":
      view.overlay = el.value;
      view.updateVectors();
      break;
    case "streamlines":
      view.lines = el.checked;
      break;
    case "arrows":
      view.arrows = el.checked;
      view.updateVectors();
      break;
    case "removePanels":
      config.panelsOpen = el.checked;
      apply(config);
      break;
    case "importFile": {
      const f = el.files?.[0];
      if (f)
        f.text().then((t) => {
          try {
            apply(normalize(JSON.parse(t)));
            $<HTMLDialogElement>("saveDialog").close();
            toast("Scene imported.");
          } catch (error) {
            toast(String(error));
          }
        });
      break;
    }
  }
});
document.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
  if (!el) return;
  if (el.dataset.tab) {
    showTab(el.dataset.tab);
    return;
  }
  if (el.dataset.custom) {
    editCustom(el.dataset.custom as Kind);
    return;
  }
  switch (el.id) {
    case "roomFocus":
      view.focus("room");
      break;
    case "caseFocus":
      view.focus("pc");
      break;
    case "compare":
      if (baseline) {
        baseline = null;
        el.textContent = "＋ Baseline";
      } else {
        baseline = clone(config);
        el.textContent = "Clear baseline";
        toast("Baseline saved. Both runs restart with matched workload and ambient conditions.");
      }
      apply(config);
      break;
    case "pause":
      paused = !paused;
      post({ type: "pause", value: paused });
      el.textContent = paused ? "Resume" : "Pause";
      break;
    case "pointSmoke":
      view.mode = "smoke";
      view.emitter = "point";
      $<HTMLSelectElement>("emitter").value = "point";
      toast("Click a point in the 3D scene to seed smoke. Drag to orbit after releasing the point.");
      break;
    case "moveDesk":
      view.focus("room");
      view.mode = "desk";
      toast("Click the floor to place the complete desk + PC setup.");
      break;
    case "placeOpening":
      view.focus("room");
      view.mode = "opening";
      view.selectedOpening = selectedOpening;
      toast("Click the selected wall to position the opening.");
      break;
    case "newWindow":
    case "newDoor": {
      const door = el.id === "newDoor";
      if (config.room.openings.length >= 12) {
        toast("Maximum 12 openings.");
        break;
      }
      config.room.openings.push({
        id: `${door ? "door" : "window"}-${Date.now()}`,
        type: door ? "door" : "window",
        wall: door ? "front" : "left",
        along: 0.5,
        width: door ? 0.85 : 1,
        height: door ? 2.05 : 1,
        sill: door ? 0 : 0.9,
        open: 1,
      });
      selectedOpening = config.room.openings.length - 1;
      apply(config);
      break;
    }
    case "deleteOpening":
      config.room.openings.splice(selectedOpening, 1);
      selectedOpening = Math.max(0, selectedOpening - 1);
      apply(config);
      break;
    case "flipFan":
      config.fans[selectedFan].intake = !config.fans[selectedFan].intake;
      apply(config);
      break;
    case "toggleFan":
      config.fans[selectedFan].enabled = !config.fans[selectedFan].enabled;
      apply(config);
      break;
    case "deleteFan":
      config.fans.splice(selectedFan, 1);
      selectedFan = Math.max(0, selectedFan - 1);
      apply(config);
      break;
    case "addFan": {
      const g = geometry(config),
        m = g.mounts.find((m) => !config.fans.some((f) => f.mount === m.id));
      if (!m) {
        toast("All supported fan mounts are occupied.");
        break;
      }
      config.fans.push({
        id: `fan-${Date.now()}`,
        part: m.sizes[0] === 140 ? "p14" : "a12",
        mount: m.id,
        rpm: 1100,
        intake: !m.id.startsWith("top") && m.id !== "rear",
        enabled: true,
      });
      selectedFan = config.fans.length - 1;
      apply(config);
      break;
    }
    case "compatibleLayout": {
      const g = geometry(config);
      config.fans = g.mounts
        .filter((m) => !m.id.startsWith("top"))
        .map((m) => ({
          id: m.id,
          part:
            m.sizes[0] === 140 ? "p14" : m.id.startsWith("top") ? "ml120" : m.id.startsWith("side") ? "stock" : "a12",
          mount: m.id,
          rpm: m.id.startsWith("side") ? 1200 : 1100,
          intake: m.id !== "rear" && !m.id.startsWith("top"),
          enabled: true,
        }));
      selectedFan = 0;
      apply(syncCoolerFans(config));
      break;
    }
    case "runDetailed":
      if (issues(config).length) {
        toast("Resolve geometry and fan-mount conflicts first.");
        break;
      }
      post({
        type: "run",
        quality: config.analysis.quality,
        seconds: config.analysis.seconds,
        gridCheck: config.analysis.gridCheck,
      });
      break;
    case "cancelRun":
      post({ type: "cancel" });
      break;
    case "addCalibration": {
      const v = (id: string) => +$<HTMLInputElement>(id).value,
        ambient = v("calAmbient"),
        cw = v("calCpuW"),
        gw = v("calGpuW"),
        cpu = v("calCPU"),
        gpu = v("calGPU");
      if (!cw || !gw || cpu <= ambient || gpu <= ambient) {
        toast("Use positive measured power and component temperatures above ambient.");
        break;
      }
      const intakeRise = lastSnapshot ? Math.max(0, lastSnapshot.stats.intake - config.room.ambient) : 0;
      config.calibrations.push({
        id: "cal-" + new Date().toISOString().slice(0, 19),
        signature: signature(config),
        ambient,
        cpuWatts: cw,
        gpuWatts: gw,
        rpm: v("calRPM"),
        cpuTemp: cpu,
        gpuTemp: gpu,
        cpuR: clampR((cpu - ambient - intakeRise) / cw, 0.1),
        gpuR: clampR((gpu - ambient - intakeRise) / gw, 0.04),
        created: new Date().toISOString(),
      });
      config.activeCalibration = config.calibrations.at(-1)!.id;
      apply(config);
      toast("Single-point calibration saved; valid only in its recorded operating range.");
      break;
    }
    case "sources":
      showSources();
      break;
    case "closeSources":
      $<HTMLDialogElement>("sourceDialog").close();
      break;
    case "saveScene":
    case "loadScene":
      openSave();
      break;
    case "closeSave":
      $<HTMLDialogElement>("saveDialog").close();
      break;
    case "saveLocal": {
      config.name = $<HTMLInputElement>("sceneName").value || "Untitled scene";
      const rows = saved().filter((s) => s.name !== config.name);
      rows.push(clone(config));
      localStorage.setItem("airflow-scenes-v2", JSON.stringify(rows.slice(-20)));
      openSave();
      toast("Scene saved locally.");
      break;
    }
    case "restoreScene": {
      const c = saved()[+$<HTMLSelectElement>("savedScenes").value];
      if (c) {
        apply(c);
        $<HTMLDialogElement>("saveDialog").close();
      }
      break;
    }
    case "exportScene": {
      const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" }),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "airflow-scene.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      break;
    }
    case "importScene":
      $<HTMLInputElement>("importFile").click();
      break;
    case "cancelCustom":
      $<HTMLDialogElement>("customDialog").close();
      break;
    case "applyCustom":
      saveCustom();
      break;
  }
});
function clampR(v: number, min: number) {
  return Math.max(min, Math.min(2, v));
}
if (innerWidth < 760) view.density = 500;
renderPanels();
apply(config);
if (location.pathname.endsWith("pc.html")) view.focus("pc", false);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) post({ type: "pause", value: true });
  else if (!paused) post({ type: "pause", value: false });
});
