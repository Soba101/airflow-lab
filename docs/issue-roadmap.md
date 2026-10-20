# Airflow Lab implementation backlog

This document preserves the technical intent and acceptance criteria for the public [GitHub Issues board](https://github.com/Soba101/airflow-lab/issues). Start with solver validation, then improve the coupled model and geometry before expanding the catalogue.

Current audit: [implementation gaps, 21 October 2026](validation/audit.md). First numerical references: [setups, thresholds and remaining gates](validation/README.md). All ten issues remain open.

## [#1 · P0] [Validate the 3D solver against documented flow benchmarks](https://github.com/Soba101/airflow-lab/issues/1)

### Goal
Establish what the numerical results can and cannot claim by comparing the browser solver with documented reference solutions and measured data.

### Why
Current checks cover conservation, buoyancy response, fan response and whether part choices change the field. Those are useful invariants, but they do not demonstrate that predicted velocity or temperature agrees with a known solution. Results must remain labeled estimates until this work and physical validation are complete.

### Work
- Add deterministic reference cases with stated geometry, boundary conditions, properties and expected values: a manufactured pressure-projection case, forced flow through a channel with an obstruction, and a heated buoyant plume.
- Record grid, timestep, solver tolerance, runtime and error metrics for each run.
- Run at two or more resolutions and report velocity, pressure-drop and temperature sensitivity.
- Compare CPU-worker and WebGPU pressure results within a documented tolerance.
- Keep reference setups, assumptions, scripts and citations in `docs/validation/`.

### Acceptance criteria
- Every case has a reproducible setup and quantitative pass/fail thresholds.
- Tests catch a deliberately perturbed boundary condition or transport term.
- Coarse/fine sensitivity appears in diagnostics and documentation.
- UI and README distinguish numerical verification from physical validation.
- No accuracy claim is made until the relevant measured PC and room data exist.

## [#2 · P1] [Make the case and room exchange physically consistent](https://github.com/Soba101/airflow-lab/issues/2)

### Goal
Improve two-way case/room coupling so fan pressure, case openings, room obstacles and returned exhaust use one consistent mass and energy balance.

### Why
The current prototype exchanges flow through fan ports and prescribed room openings, but pressure coupling and boundary exchange remain simplified. The recirculation percentage and room temperature should not be treated as predictions until these assumptions are tested.

### Work
- Document the sign convention and control-volume balance for every case and room port.
- Ensure equal and opposite mass and heat transfer at each interface, including simultaneous intake and exhaust fans.
- Replace arbitrary mixing or source/sink corrections with an explicit, documented boundary treatment.
- Represent desk/tabletop, floor, wall clearance and openings as boundaries or obstacles in the room grid.
- Keep window/door exchange user-controlled until external wind and stack conditions are modeled.
- Add a near-wall and exhaust-to-intake recirculation benchmark.

### Acceptance criteria
- Per-step case, room and total-domain mass residuals are reported and tested.
- Energy change equals electrical heat plus explicitly listed external exchange within a declared tolerance.
- Moving the PC near a wall, changing desk height, or moving an opening changes the field repeatably.
- Warm exhaust can be traced through the room and back to an intake when the calculated field supports it.
- The UI labels recirculation as a tracer-based model metric and explains its limits.

## [#3 · P1] [Validate case, motherboard, GPU and cooler geometry](https://github.com/Soba101/airflow-lab/issues/3)

### Goal
Make drawn parts and fit checks follow real dimensions and mounting rules.

### Work
- Define and document one coordinate convention for every part and case measurement.
- Add board-specific PCIe slot centerlines, socket position and cooler clearance from primary sources or user measurements.
- Derive GPU placement/orientation from the selected motherboard slot and case mount; offer slot choices only when the selected board has them.
- Model supported fan/radiator mounts, thickness stacks, cable/panel clearance and known obstructions.
- Name each conflicting part pair and show the dimensions used; allow measured overrides for unknown internal coordinates.

### Acceptance criteria
- H6/5090/H100i and 4000D/4080/U12A presets have per-property provenance and no silently rearranged parts.
- Tests cover GPU length, height/thickness, slot alignment, radiator/fan stack, cooler/RAM clearance, duplicate mounts and case-boundary collisions.
- Every issue identifies the exact part or mount and suggests a valid user action.
- Custom dimensions round-trip through save/export/import without changing units or orientation.
- A modeled fit is never described as a physical fit certification.

## [#4 · P1] [Audit catalogue sources and fan/panel performance data](https://github.com/Soba101/airflow-lab/issues/4)

### Goal
Separate published facts, user measurements and modeled assumptions for every exposed component property.

### Work
- Audit each case, GPU, motherboard, CPU, RAM, storage, cooler and fan against manufacturer documentation.
- Store evidence per property (dimensions, RPM, free-air flow, shutoff pressure, mount support), not as a blanket part-level claim.
- Add manufacturer pressure/flow data where available; otherwise mark the estimated curve and its source endpoints.
- Add editable uncertainty ranges for mesh, filters, radiator, heatsinks and other restrictions.
- Record SKU/revision, source URL, units, retrieval date and attribution.

### Acceptance criteria
- The evidence view shows source and status for each number that affects geometry or the solver.
- User measurements override only their corresponding property and survive export/import.
- Assumed values are labeled in selectors, diagnostics and comparison exports.
- Fan operating points respond monotonically to RPM, flow and restriction, with documented tests.
- No new catalogue entry is called verified without evidence for the specific exposed properties.

## [#5 · P1] [Separate component thermal estimates from air temperature](https://github.com/Soba101/airflow-lab/issues/5)

### Goal
Provide CPU/GPU thermal-network estimates that account for heat storage and cooler paths, with calibration tied to the build and workload measured.

### Work
- Document nodes, heat capacity, conductance and paths for CPU, air cooler, AIO block/coolant/radiator and GPU core/heatsink.
- Ensure every watt leaving a component enters coolant, case air or an explicitly modeled sink.
- Use measured package power and fan RPM for calibration, not TDP.
- Bind calibration to exact part IDs/revisions, ambient, load and RPM range; warn and disable it outside that range.
- Show whole-degree estimates and an uncertainty band only when supported by data; retain an explicit uncalibrated state.

### Acceptance criteria
- Analytical tests cover step response, equilibrium, zero load, RPM changes, AIO and air-cooler paths.
- Calibration for one GPU/cooler cannot silently apply to another configuration.
- UI explains required measurements and what one calibration point cannot validate.
- Energy balances close within documented tolerances in both transient and steady cases.

## [#6 · P1] [Make case-focused airflow visualization easy to read](https://github.com/Soba101/airflow-lab/issues/6)

### Goal
Make air paths legible in the whole-room scene and inside the selected PC.

### Work
- Keep case focus centered and scaled to the viewport; return to the same room camera when users leave focus.
- Show component/fan labels without covering paths; make panels and depth slicing understandable.
- Seed particles at a selected fan, opening or 3D point; add density, speed, trail duration and deterministic replay controls.
- Provide units and readable legends for velocity, temperature and relative pressure.
- Advect particles through the calculated room/case field with a clear boundary handoff.
- Distinguish intake, bypass, recirculation and room exhaust paths where the field supports them.

### Acceptance criteria
- Users can identify fans, GPU/cooler, intake/exhaust direction and component locations in both presets.
- Changing a part, fan direction/RPM, panel or obstruction changes both the computed field and visible paths.
- Focus works for both cases and remains in bounds after room resizing.
- Smoke-off, reduced-motion, keyboard and phone modes remain useful.

## [#7 · P1] [Harden versioned scenes, custom parts and migration](https://github.com/Soba101/airflow-lab/issues/7)

### Goal
Let users edit, save and share builds without corrupting settings or hiding geometry changes.

### Work
- Validate imported identifiers, dimensions, normals, curves, RPM, loads, thermal properties, openings and calibrations.
- Reject invalid input atomically with field-level errors and preserve the last working scene.
- Migrate legacy room/build storage while retaining fan direction/RPM, heat, room geometry, openings and desk/PC position.
- Clarify which inherited custom-part mounts and board slots are copied assumptions versus measured values.
- Support schema version changes, duplicate scene names and recovery from malformed local storage.
- Use deterministic IDs rather than millisecond timestamps for custom parts/fans.

### Acceptance criteria
- Valid scenes round-trip through save/load and JSON import/export.
- Invalid data and unsupported versions produce clear errors without changing active or saved scenes.
- Migration tests cover all prior storage keys and preserve the user's settings.
- Calibration remains isolated by hardware signature and measured operating range.

## [#8 · P2] [Make detailed analysis budgets and WebGPU fallback reliable](https://github.com/Soba101/airflow-lab/issues/8)

### Goal
Let users choose analysis quality and time while reporting honest progress and handling unavailable/lost GPU devices.

### Work
- Expose Draft, Balanced and Fine plus 30-second, 2-, 5- and 10-minute, custom and until-converged budgets.
- Estimate runtime from the active grid/device; label it as an estimate and keep worker preview independent.
- Cancel superseded runs, release resources, mark changed-geometry results stale, and label partial results incomplete.
- Define convergence checks for pressure, mass, heat, component-temperature rate and grid sensitivity.
- Handle no WebGPU, adapter failure, device loss, tab visibility, pause/resume and memory limits with clear states.

### Acceptance criteria
- No run is labeled converged unless every configured criterion passes at the selected resolution.
- Budget expiry/cancellation retain diagnostics but show incomplete/cancelled status.
- WebGPU absence/loss never leaves a false success state; the coarse worker preview still works.
- Only the newest scene revision can publish results.
- Device support and estimated runtime are shown before detailed analysis begins.

## [#9 · P2] [Make configuration comparisons repeatable and exportable](https://github.com/Soba101/airflow-lab/issues/9)

### Goal
Compare part and placement choices under identical conditions and show which settings differ.

### Work
- Lock baseline room, temperatures, openings, desk/PC placement, workload, simulated clock and analysis quality.
- Compare complete configurations: component temperatures, intake/exhaust flow, tracer recirculation, room heat and convergence state.
- Use deterministic solver initialization and smoke seeds for repeatable numeric comparisons and screenshots.
- Show changed parts, mounts, fan settings and room settings.
- Export inputs, diagnostics, model version, assumptions and sources as JSON/CSV.

### Acceptance criteria
- Runs use matched conditions and elapsed time; any quality difference is visible.
- Stale, incomplete, unconverged and differently calibrated results are clearly marked.
- Repeating one scene stays within a declared numerical tolerance.
- Export contains enough provenance to reproduce the setup and excludes browser/account identifiers.

## [#10 · P2] [Improve accessibility, phone controls and startup performance](https://github.com/Soba101/airflow-lab/issues/10)

### Goal
Keep the desktop 3D workspace understandable and useful on smaller screens and lower-powered devices.

### Work
- Lazy-load Three.js/worker after the page shell and split the client bundle.
- Provide reduced phone grid/particle density, responsive parts controls and readable result cards.
- Add keyboard controls, semantic labels, visible focus, reduced-motion handling and non-color-only indicators.
- Detect WebGL/WebGPU capability and context/device loss; show a useful fallback without invented results.
- Separate render-quality controls from solver-quality controls.

### Acceptance criteria
- The page explains requirements when WebGL2 is unavailable and shows no fabricated result.
- Phone layout exposes essential parts, room and results controls without horizontal overflow.
- Keyboard users can operate selectors, tabs, dialogs, smoke controls, analysis and comparison.
- Startup size, first interactive time, frame rate and memory are measured on a desktop and phone-class device.
