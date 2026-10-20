# Airflow Lab handoff

Updated 21 October 2026 (Asia/Singapore)

## Current state

Airflow Lab has moved from the earlier 2D room model and fixed-build case illustration to a configurable browser-based 3D prototype. The user's H6 Flow / RTX 5090 / H100i setup remains available as a preset, alongside a Corsair 4000D / RTX 4080 SUPER / Noctua NH-U12A preset.

- Public source: [github.com/Soba101/airflow-lab](https://github.com/Soba101/airflow-lab)
- Live GitHub Pages app: [soba101.github.io/airflow-lab](https://soba101.github.io/airflow-lab/)
- Starting handoff commit: `f39baa4`; latest continuation adds numerical benchmarks and an implementation audit.
- Simulator implementation commit: `96c5732` — configurable 3D rebuild
- GitHub Actions: run `39471285878` passed for `b48ac0b`, including tests, type-check, static build and Pages deployment
- Detailed backlog: [GitHub Issues #1–#10](https://github.com/Soba101/airflow-lab/issues) and [docs/issue-roadmap.md](docs/issue-roadmap.md)

The project was updated on the public GitHub repository and GitHub Pages. The separate private ChatGPT Site was not changed during this rebuild.

## Run and develop

Use Node.js 22 or later. From a fresh checkout:

```sh
npm ci
npm run dev
```

Vite prints the local preview address. To check a change:

```sh
npm test
npm run build
```

The Pages workflow runs these checks and publishes the generated `dist/` directory. `dist/` is intentionally generated during CI and ignored by Git. Pushes to `main` publish automatically.

## Where to start in the code

- `src/main.ts` builds the parts, room, analysis, comparison, save/load and calibration controls.
- `src/catalog.ts` holds the curated parts and their evidence/assumptions.
- `src/config.ts` defines the versioned `SceneConfig`, migration, geometry and compatibility checks.
- `src/fluid.ts` implements the 3D staggered velocity field, pressure projection, buoyancy, heat and tracer transport.
- `src/coupled.ts` connects the case to room ports, updates fan operating points and reports diagnostics.
- `src/thermal.ts` implements lumped CPU/GPU thermal nodes.
- `src/sim.worker.ts` runs preview and detailed analysis off the UI thread; `src/webgpu.ts` accelerates pressure solving when supported.
- `src/view.ts` builds the Three.js room/case scenes, smoke particles, streamlines, focus controls and overlays.
- `tests-v2/prototype.test.ts` covers the new 3D prototype; `tests/` keeps the original 2D model regression tests alive.
- `legacy/` preserves the previous app while the 3D version is developed.
- `docs/issue-roadmap.md` mirrors the technical scopes and acceptance criteria on the GitHub Issues board.

## What the prototype currently does

Users can select the case, GPU, motherboard, CPU, RAM, storage and cooler; select individual fans and change model, mount, direction, RPM and enabled state; adjust workload; change room/desk conditions and openings; focus the camera on the room or case; follow smoke and streamlines; inspect temperature or pressure overlays; save configurations locally; import/export JSON; compare against a baseline; and enter a single-point thermal calibration.

The case focus now hides the room furniture/walls and zooms closer to the selected tower. Fan/radiator mounts are case-dependent, the GPU follows the modeled motherboard slot, and compatibility conflicts are surfaced instead of silently rearranging parts.

## Important limits

Treat all airflow and component temperature numbers as model estimates. The prototype has numerical invariant tests, but those tests do not establish accuracy against physical hardware or a validated CFD solution. Begin follow-up work with [issue #1](https://github.com/Soba101/airflow-lab/issues/1), which adds documented reference benchmarks.

The solver uses coarse 3D grids, simplified momentum and buoyancy, porous resistance, prescribed room opening exchange, and approximate case/room ports. It does not predict outdoor wind, stack-driven ventilation, turbulence at engineering fidelity, wall heat storage, humidity, radiation or fine blade/heatsink geometry. The CPU, GPU, cooler, radiator and coolant parameters are largely assumed until calibrated. Catalogue citations support only the individual properties listed as verified; internal mount coordinates and several envelopes remain approximate.

WebGPU is used for a pressure-solve path when available. The coarse worker preview remains available without WebGPU; detailed analysis requires the GPU path. The main browser bundle currently triggers Vite's 500 kB advisory (about 629 kB minified, 165 kB gzip), so startup and memory optimization are tracked in [issue #10](https://github.com/Soba101/airflow-lab/issues/10).

## Suggested next session

1. Open the public demo and select **Inside PC** to review the latest focus framing and airflow trails.
2. Start with [issue #1](https://github.com/Soba101/airflow-lab/issues/1). Add one analytic or documented 3D benchmark before claiming improved prediction accuracy.
3. Continue with coupling and geometry issues [#2](https://github.com/Soba101/airflow-lab/issues/2) and [#3](https://github.com/Soba101/airflow-lab/issues/3), then audit catalogue evidence in [#4](https://github.com/Soba101/airflow-lab/issues/4).
4. Run `npm test` and `npm run build` before pushing. The workflow deploys successful pushes to `main` automatically.

Keep the status language conservative: call outputs estimates until benchmark and real-hardware measurements support stronger claims.

## Continuation — 21 October 2026

Read issues #1–#10 and pulled main at f39baa4. Added `npm run benchmark`, independent analytic projection/diffusion references at two resolutions, fault-detection tests, and recorded JSON results in `docs/validation/`. Replaced the hardcoded coupling heat error with an assembled interface power residual shown in diagnostics. See `docs/validation/audit.md` for concrete gaps across all issues. Issue #1 stays open: channel obstruction, plume, GPU parity and physical validation are unfinished. Prioritize those, then coupling/geometry/readability as described in the audit.

Validation: npm ci completed; local Vite dev server started; all 32 tests and npm run build passed (629.40 kB main bundle; size advisory remains). Browser/WebGPU visual and physical validation have not been performed in this continuation.

## Visual review — 21 October 2026

Inspected deployed room and PC views in the browser. Found a cropped case focus, rear-facing motherboard view, severe shadow stripes, low contrast and oversized persistent overlays. Updated focus to fit a bounding sphere using viewport aspect/FOV, face the component side, and restore the prior room camera. Disabled artifact-prone shadows, made component envelopes opaque with distinct colors, reduced glass opacity and changed smoke to cyan-to-amber. Evidence and airflow controls now use native disclosure panels. Local H6 view was visually checked at 1280×720; alternate preset selection works, but subsequent screenshot capture timed out. Full phone/other-browser coverage remains outstanding. All 32 tests and production build passed before the final small-screen-height CSS adjustment; final build repeated. These are rendering changes, not improvements in physical accuracy. Issue #6 remains open for labels, scales and resolved smoke handoff.
