# Airflow Lab

Airflow Lab is a browser-only PC airflow sandbox. Pick parts, arrange a room and desk, then follow smoke through a simulated case and into the room. The public demo is [soba101.github.io/airflow-lab](https://soba101.github.io/airflow-lab/).

## What works now

- A connected Three.js room and PC view. Use **Room & desk** and **Inside PC** to move between them. In the case view, the room, desk and wall panels clear away so the selected hardware and flow are visible.
- Part selectors for case, GPU, motherboard, CPU, RAM, storage and cooler. Start from either the H6 Flow / RTX 5090 / H100i or 4000D / RTX 4080 SUPER / NH-U12A preset.
- Individual fan selection, model, supported case mount, RPM, direction and enabled state. A change of case keeps the selected configuration and reports invalid mounts; **Apply this case’s compatible starter layout** offers a replacement layout.
- Room dimensions, temperatures, heat loads, desk placement, doors and windows. The desk and PC move together. Room mode lets users drag the setup or selected opening.
- Computed 3D worker preview, smoke particles, streamlines, direction arrows, temperature/pressure overlays, room and case focus, a depth slice, and a point smoke source.
- Save/load in local browser storage and JSON import/export. Baseline comparison uses the same room conditions and workload.
- Optional measured thermal calibration, with profiles tied to the selected hardware and nearby operating conditions.
- A WebGPU pressure-solve path when supported. The worker keeps a coarse preview available without WebGPU; detailed runs explain when the GPU path is unavailable.

## Part data and model limits

The catalogue is intentionally small. Manufacturer links and verified properties are listed in the selector. An evidence label applies to the listed dimensions or specification only; it does not mean the full geometry or simulation is validated. The user's exact H6 Flow / RTX 5090 build is a preset, alongside a 4000D / RTX 4080 alternative.

Airflow, pressure loss, fan operating points, heat transfer, and component temperatures are engineering-style **model estimates**. Fan curves are estimated from published endpoints unless a measured curve is entered. The case's internal mount coordinates, panel/filter losses, GPU cooler behavior, thermal resistances, RAM envelope and some part placement remain assumptions. The solver is not CFD-grade and is not calibrated against physical measurements. Use the **Sources & limits** panel for the assumptions attached to the current build.

The GPU follows the motherboard's modeled PCIe slot. Fans and radiators snap to modeled mounts; geometry conflicts are reported instead of silently moving parts. A reported envelope fit is not a fit certification. The 3D grid is coarse, turbulence is simplified, and openings use a prescribed exchange rate rather than predicting outdoor wind or stack flow. Room walls and furniture have no heat storage; humidity and solar gain are omitted. The laptop/phone preview lowers particle density, and detailed analyses target desktop browsers.

## Run locally

Requires Node.js 22 or later and npm:

```sh
npm ci
npm run dev
```

Vite prints the local URL. `npm test` runs the solver/profile checks. `npm run build` type-checks the TypeScript and creates the static site in `dist/`.

## Numerical verification

`npm run benchmark` emits reproducible two-resolution pressure-projection and heat-diffusion errors. See [reference setups and thresholds](docs/validation/README.md), [recorded results](docs/validation/results.json), and the [requirements audit](docs/validation/audit.md). These checks verify limited numerical behavior, not physical PC/room accuracy. Obstructed flow, plume and WebGPU parity benchmarks remain open in issue #1.

## Project map

- `src/catalog.ts` — sourced catalogue entries and fan/mount metadata.
- `src/config.ts` — versioned `SceneConfig`, migration, dimensions, mount and fit checks.
- `src/fluid.ts` — staggered 3D velocity grid, pressure projection, buoyancy and conservative heat/tracer transport.
- `src/coupled.ts` and `src/thermal.ts` — two-way case/room ports and component thermal nodes.
- `src/sim.worker.ts` and `src/webgpu.ts` — background calculations, WebGPU pressure solve, analysis budget and cancellation.
- `src/view.ts` and `src/main.ts` — Three.js scene and user controls.
- `legacy/` — previous 2D room and illustrative case views, retained as a reference during the 3D rebuild.
- `tests-v2/` — 3D solver, energy, fan, thermal, geometry and configuration checks.
- `tests/` — original room model checks.

## GitHub Pages

The repository is public and GitHub Pages publishes the static build at [https://soba101.github.io/airflow-lab/](https://soba101.github.io/airflow-lab/). The Actions workflow installs locked dependencies, runs both test suites, type-checks and builds the site, then deploys `dist/`. GitHub Pages can host public repositories on GitHub Free; see [GitHub's Pages limits and terms](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

## Work queue

The [GitHub Issues board](https://github.com/Soba101/airflow-lab/issues) contains ten implementation tasks with scope, rationale and acceptance criteria. The same roadmap is kept in [docs/issue-roadmap.md](docs/issue-roadmap.md). See [HANDOFF.md](HANDOFF.md) for project status, setup instructions, architecture, limitations and the recommended next session. The highest priority is validating the numerical model before adding catalogue breadth.
