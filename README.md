# Airflow Lab

An interactive browser sandbox for PC case airflow, desk placement, room ventilation and sensible heat. Runs entirely in the browser, without a server API or account. Generic rooms are user-defined; a sourced NZXT H6 Flow / RTX 5090 build is included.

## Views

- **Desk setup:** choose PC placement on, under, or beside the desk. Resize the desk and move the linked desk/PC group in the room plan.
- **Room airflow:** set initial/outdoor/adjacent-space temperatures, room dimensions, PC heat, AC supply/capacity, fan direction, and assumed ventilation. Add windows and doors to walls, set width and open fraction, and compare configurations at identical elapsed times.
- **Your PC:** dimensioned cutaway, side and top views of the H6 Flow build, with per-fan speed/direction controls, source links and a heat-load transfer to the room.

## Included hardware profile

- GIGABYTE GeForce RTX 5090 WINDFORCE OC 32G (342 × 150 × 65 mm)
- AMD Ryzen 7 5700X3D
- GIGABYTE B550 AORUS ELITE V2, rev 1.5 (305 × 244 mm)
- Patriot VIPER STEEL 32 GB (2 × 16 GB) DDR4-3200 (exact SKU unconfirmed)
- Unspecified 512 GB M.2 NVMe (2280 envelope assumed) + Samsung 860 QVO 2 TB SATA
- NZXT H6 Flow non-RGB
- 2 × ARCTIC P14 Pro PST bottom fans, 1 × P12 Pro PST rear, 3 × stock NZXT case-version fans
- Corsair H100i RGB PRO XT 240 mm top radiator; its 2 supplied ML120 fans assumed present

Published part envelopes and mount support are sourced in `dist/build-profile.mjs` and linked in the app. Exact mount coordinates, fan directions, RPM, RAM envelope, tube routing, PSU and storage locations are assumptions. No fit certification or chip-temperature prediction is provided.

## Run locally

Serve the `dist/` directory over HTTP, for example:

```sh
python3 -m http.server 8765 --directory dist
```

Then visit `http://localhost:8765/`. No installation or build step is needed. Room/build modules use browser ES modules.

## Tests

With Node.js installed:

```sh
node --test tests/*.test.mjs
```

Tests verify conservation of sensible heat, uniform temperature invariance, AC capacity limits, ventilation, impermeable solids, room/part dimensions, fan capacity accounting, opening placement and linked desk movement. Numerical invariants are not validation against a real room.

## Model and limits

Room airflow uses a steady finite-volume staggered-grid projection of prescribed jets with balanced volume sources/sinks. Conservative upwind thermal transport adds PC power, fan heat, other loads, AC sensible cooling, opening exchange and envelope conductance.

The room is 2D and height-averaged. It omits vertical buoyancy/stratification, flow over furniture, radiation, humidity and wall/furniture heat storage. The simplified PC footprint acts as a full-height solid. Above/below-desk placement is visual; the room solver resolves floor coordinates only. Local temperature peaks and velocity depend on resolution and the assumed jet/mixing profiles.

Ventilation rate is prescribed by the user, then scaled by average opening fraction. Moving openings changes inlet/return locations, but window dimensions do not predict wind- or stack-driven flow. Window supply uses outdoor temperature; door-only supply uses the adjacent-space temperature. Closed or absent openings give zero prescribed opening exchange. Separate infiltration is not modelled.

The PC cutaway is an illustrative geometric model, not a fluid solver. The room uses assumed installed PC flow, not a sum of free-air fan ratings. A heat-load transfer from the PC view copies only the selected electrical heat total to the room. Component-to-room airflow coupling remains future work.

All scene settings are stored only in the browser's local storage. No telemetry or backend is included.

## GitHub Pages

The supplied GitHub Actions workflow tests and uploads only `dist/`. Enable GitHub Pages with **GitHub Actions** as the publishing source. Relative asset/navigation paths support project sites under `/airflow-lab/`.

GitHub Pages is available free for public repositories on GitHub Free, subject to GitHub's service terms and limits: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits

## Next steps

Measure room geometry, vent flow and temperatures; compare sensor traces; add thermostat control, thermal storage, sunlight and humidity; then prepare 3D geometry and a separate buoyant-flow solver. Blender can prepare geometry but does not by itself validate airflow.
