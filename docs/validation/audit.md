# Implementation audit — 21 October 2026

Baseline f39baa4; all ten issues read before edits. Existing functionality is preserved. Open means the acceptance criteria are not fully met.

| Issue | Concrete evidence and remaining work |
| --- | --- |
| #1 | Added cosine projection and heat diffusion references at 8³/16³ with thresholds and fault detection. Obstructed channel, plume, GPU parity and measured validation remain open; see validation README. |
| #2 | `makeTerms` couplingError was a hardcoded zero; now independently integrated and tested. `updatePorts` solves one lumped PC pressure, not local case pressure continuity. Room furniture is center-sampled and thin legs/tabletop can vanish. Domain mass residuals and near-wall recirculation benchmarks remain missing. |
| #3 | `geometry` computes slot height as board.slots + case-height offset, while custom UI calls slots heights above case floor. GPU lateral placement is fixed at .018, not derived from tray/connector. Socket coordinates are hardcoded. `issues` lacks general pair collisions, GPU thickness and radiator/fan-stack checks. Define coordinate semantics and measured provenance before modifying presets. |
| #4 | Catalogue uses verified string lists and one URL per part, not evidence records per numeric property. No retrieval date/revision per property or panel-loss uncertainty controls. Coupling loss coefficients 9000/22000/180000 remain assumptions. |
| #5 | `thermalStep` conserves lumped node power, but diagnostic equilibrium cpu/gpu uses total R/flow while node path scales only sink-to-air R. Headline and transient equilibrium therefore disagree away from unit flow. Calibration is single-point; analytical equilibrium/RPM coverage is incomplete. |
| #6 | `focus` replaces room camera with a fixed default and hides all labels in PC mode. `portal` teleports smoke near a fan with random jitter; it is not continuous resolved interface advection. Legends lack numeric scales; deterministic replay and trail duration controls are absent. |
| #7 | `normalize` clamps/filters many invalid inputs instead of atomic field errors; unknown fan IDs fall back through `part`. Custom normals/curves/thermal properties are not comprehensively checked. `makeCustom` uses Date.now IDs. Migration omits legacy openings/exchange. |
| #8 | `tick` checks component rates, residual, total energy and port mass, but gridDelta does not gate convergence. Draft reference can equal selected draft. Heat/flow/grid sensitivity gates and runtime estimates remain incomplete. Async GPU prepare can finish after generation changes; generation needs checking before commit/publish. |
| #9 | Baseline locks room/load and shared timestep, but keeps its desk/PC placement without clearly listing differences. Export contains scene inputs only, no results/model provenance. Smoke uses Math.random; no deterministic screenshot replay. |
| #10 | Static Three.js import and immediate renderer construction remain. Capability/context-loss fallback and device measurements are incomplete. Pointer-only desk/opening/smoke placement needs keyboard alternatives. Bundle advisory remains. |

Next implementation order: finish #1 reference boundary specification and backend comparison; #2 conservative obstacle/interface treatment; #3 board/tray/slot geometry with explicit coordinates and tests; #6 labels, scales and camera restoration. Do not close issues based only on build/test success.
