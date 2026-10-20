# Numerical verification ledger

21 October 2026. Run `npm ci`, `npm run benchmark`, `npm test`. The benchmark command emits JSON; `results.json` records one local run (runtime is informational, not a CI threshold). These execute the same FluidGrid code imported by the browser worker, on the CPU in Node. They do not exercise browser scheduling or WebGPU.

## Analytic references

Both cases use a 1 m cube, 8³ and 16³ uniform cells, no solids, no volume sources, and closed boundaries. They are deliberately one-dimensional analytic fields embedded in the 3D grid; they do not verify all axes or arbitrary geometry.

1. **Pressure projection.** Initialize staggered x velocity to −π sin(πx) m/s, other components zero, including all normal wall velocities. The continuum correction potential is φ=cos(πx) m²/s, so subtracting its gradient leaves zero velocity. Neumann pressure is defined only up to a constant; remove the fluid-cell mean before comparison. Physical correction pressure is ρφ/Δt, with ρ=1.2 kg/m³ and Δt=0.025 s. CPU conjugate gradient uses at most 1000 iterations and absolute residual tolerance 1e−10 s⁻¹. The report's pressureError is the maximum **potential** error (m²/s), not Pa. Multiply by 48 for Pa. Pass: velocity max <1e−8 m/s, RMS divergence residual <1e−9 s⁻¹, potential max error <0.007 m²/s.
2. **Insulated heat diffusion.** Zero velocity; initial T=27+cos(πx) °C, diffusivity α=0.01 m²/s. Exact solution T=27+exp(−απ²t)cos(πx) follows by direct substitution into ∂T/∂t=α∇²T with zero normal derivative at every wall. Integrate to 0.1 s with explicit Δt=0.1/n² s, n² steps. Pass: maximum error <0.00013 K, total energy drift <1e−8 J. No pressure solve is needed.

For each reference, the coarse/fine maximum-error ratio must lie in [3.8,4.2]. This checks the expected second-order trend for these smooth fields with Δt proportional to h²; it is not an order claim for momentum advection or the complete PC simulation. Thresholds are regression limits, not experimentally derived accuracy bands. Tests intentionally introduce a 0.1 m/s wall leak and disable the diffusion term, and require the corresponding limits to fail.

The analytic expressions above are derived here, independently of the implementation stencil. Grid-refinement methodology: [NASA/NPARC, Examining Spatial (Grid) Convergence](https://www.grc.nasa.gov/www/wind/valid/tutorial/spatconv.html), accessed 21 October 2026. Two grids are a starting point; broader verification needs more grids and independent temporal refinement.

## Remaining issue #1 gates

- Forced channel with obstruction: inlet/outlet and tangential wall treatment must be specified before comparing pressure drop to a reference. Current momentum resets outer normal velocities and mixes wall treatments; no valid reference result is claimed.
- Heated plume: a rising-temperature invariant is not a benchmark of plume speed, spreading or temperature decay. Specify enclosure/open boundaries and a reference first.
- CPU/WebGPU parity: not run. GPUProjector uses 160 Jacobi passes plus 45 CPU correction iterations; tests of CPU alone cannot establish parity. Compare corrected velocity, mean-free pressure and divergence on an actual WebGPU adapter, including obstacles.
- The report contains pressure/velocity and temperature sensitivity for separate analytic cases, not coupled case/room grid independence. Detailed-run gridDelta currently measures component estimates only and does not gate convergence.
- Measured fan curves, case pressure/flow and room thermal data remain absent. All app outputs remain model estimates.

## Interface balance convention

Port q is positive into the PC, in m³/s. PC source integrates to +q; room source to −q. Heat is transferred at the source-side patch-weighted temperature, with equal/opposite sensible-enthalpy rates ρcp qT. `couplingError` now independently integrates the assembled supply and sink arrays on both grids, in W, before external ventilation and thermal loads are added. A test uses nonuniform temperatures and deliberately breaks patch normalization to ensure the diagnostic is not tautologically zero. This verifies scalar transfer accounting, not pressure continuity, spatial boundary fidelity or recirculation accuracy.
