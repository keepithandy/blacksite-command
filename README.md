# Blacksite Command

Blacksite Command is a dependency-free browser command-station game built around a fictional classified surveillance and response loop:

**Detect → Correlate → Investigate → Respond → Contain → Report**

## Current playable baseline — v0.0.4.2

- circular PPI-style primary radar scope with an 80 NM display range
- rotating sweep arm with a stronger trailing bloom and phosphor persistence
- brief hit flares when the sweep crosses a tracked return
- 20 / 40 / 60 / 80 NM range rings plus 30-degree bearing marks
- bezel labels that illuminate as the sweep passes them
- projected bearing/range readouts plus heading readouts for moving tracks
- short track-history trails and visible heading/velocity vectors
- one-shot acquisition pulse treatment for newly observed contacts
- distinct RAW / TRACK / CONFIRMED / COAST radar return presentation states
- restrained priority brackets/pulse on confirmed or high-priority tracks
- stronger coasting trails and projected ghost positions when the array is impaired
- weather/facility-driven ghost returns and noisy interference arcs
- subtle scope-glass, scanline, reflection, and vignette treatment
- live sector contacts backed by RADAR, SIGINT, SATELLITE, and GROUND sources
- sector-specific sensor coverage, weather effects, outages, and timed satellite passes
- cross-sensor correlation where independent sources directly improve confidence
- two-source minimum for response authorization and incident promotion
- three-source fusion requirement for confirmed assessment stage
- Facility Command with POWER, COMMS, RADAR ARRAY, SAT UPLINK, INTEL SERVERS, and SECURITY
- facility condition and transient faults that directly affect sensor support and command availability
- emergency power reserve with automatic load shedding under serious power stress
- operator STABILIZE actions with short repair cooldowns instead of a heavy resource-management layer
- facility alerts, transient recovery, and repair history in the station feed
- SIGINT-style station feed with sensor, weather, incident, and infrastructure events
- multi-stage incidents: Acquisition → Correlation → Assessment → Resolution
- automatic case-file generation with retained sensor provenance
- local persistent case archive that survives reloads when browser storage is available
- five-minute shift clock, scoring, accuracy, after-action grade, and facility summary
- keyboard-accessible controls and responsive narrow-screen layout
- dependency-free Node smoke coverage for radar helpers, visual-effect helpers, runtime, sensor, facility, incident, and archive transitions

## Radar Realism + Visual Effects

The primary display is presented as a traditional plan-position-indicator style radar instrument rather than a rectangular tactical map.

The realism layer provides:

- circular scope and center-origin station marker
- roughly four-second rotating sweep
- phosphor-style return brightening and persistence fade
- nautical-mile range rings and bearing marks
- per-track bearing/range readouts
- RAW, TRACK, CONFIRMED, and COAST visual states
- weather clutter and visible RADAR ARRAY degradation

The v0.0.4.2 visual-effects layer adds extra presentation without changing game logic:

- broader sweep bloom behind the primary sweep line
- short hit flares when returns are refreshed
- heading/velocity vectors derived from recent display history
- single acquisition pulse rings on newly observed contacts
- priority brackets on confirmed/high-priority tracks
- stronger ghost/coasting projections during degraded or offline radar operation
- ambiguous ghost returns and interference arcs that increase with clutter and facility impairment
- subtle scanline/glass/vignette treatment
- sweep-lit bezel bearings

These effects are deliberately subdued and instrument-like rather than neon sci-fi. Reduced-motion preferences suppress the animated decorative effects.

The radar layers are presentation-only. Existing contact movement, sensor correlation, incident promotion, scoring, response logic, Facility Command, and archive behavior remain unchanged.

## Facility Command

Facility Command adds a lightweight infrastructure layer without turning the game into a management spreadsheet.

The station tracks six systems:

- **POWER** — feeds the station and emergency reserve
- **COMMS** — supports SIGINT, ground links, orbital relay, and response dispatch
- **RADAR ARRAY** — directly controls RADAR support
- **SAT UPLINK** — controls whether orbital passes can contribute to correlation
- **INTEL SERVERS** — supports correlation throughput, SIGINT, and ground fusion
- **SECURITY** — represents protected station integrity and response coordination

Systems can suffer degraded or offline transient faults. Their condition also declines when faults strike. Minor transient faults clear on their own; the operator can use **STABILIZE** to restore condition and clear the active fault immediately.

When POWER is badly compromised, emergency reserve drains. Load shedding automatically suspends SATELLITE support and limits GROUND relays so RADAR and core communications can remain available longer.

Facility state is shift-local. Case-file persistence remains unchanged.

## Sensor Network

Every shift creates sector coverage for North Ridge, Dry Lake, Echo Valley, West Range, and Salt Flats.

RADAR, SIGINT, and GROUND nodes are persistent sector assets. SATELLITE coverage is orbital and only contributes while its timed pass is over a sector. Weather modifies the effective reliability of every sensor source. Network events can temporarily degrade or take a sector sensor offline; Facility Command can additionally reduce or remove entire source classes when their supporting infrastructure is impaired.

Contacts retain the sources that actually detected or corroborated them. Correlation quality progresses from:

**single-source → supported → multi-source → fused**

## Run

Open `index.html` directly in a browser. No build step or server is required.

## Validate

```bash
npm run smoke
```

The smoke command runs the existing gameplay/facility/radar-realism suite and a focused v0.0.4.2 visual-effects helper suite covering heading calculation, bounded velocity-vector sizing, clutter/impairment-driven ghost-return density, and sweep-angle wraparound.

## Persistence

Only resolved fictional case-file data is stored in browser `localStorage` under `blacksite-command.case-files.v1`. Facility Command state resets with each new shift. Radar presentation history and visual effects are display-only and reset when the page reloads. No network request or external action is performed. If storage is blocked or unavailable, the game continues with a session-only archive.

## Project direction

The intended full game expands the station with deeper procedural incident chains, progression, related-case intelligence, long-term mysteries, tutorial/endless play, saves, and additional mobile/accessibility polish.

All present behavior is fictional and self-contained. The game does not perform real external actions.
