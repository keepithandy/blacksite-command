# Blacksite Command

Blacksite Command is a dependency-free browser command-station game built around a fictional classified surveillance and response loop:

**Detect → Correlate → Investigate → Respond → Contain → Report**

## Current playable baseline — v0.0.4.1

- circular PPI-style primary radar scope with an 80 NM display range
- rotating sweep arm with phosphor-style contact refresh and persistence fade
- 20 / 40 / 60 / 80 NM range rings plus 30-degree bearing marks
- projected bearing/range readouts and short track-history trails for live contacts
- distinct RAW / TRACK / CONFIRMED / COAST radar return presentation states
- radar clutter that reacts to sector weather and RADAR ARRAY condition
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
- dependency-free Node smoke coverage for radar helpers, runtime, sensor, facility, incident, and archive transitions

## Radar Realism Pass

The primary display is now presented as a traditional plan-position-indicator style radar instrument instead of a rectangular tactical map.

The display includes:

- a circular scope and center-origin station marker
- a rotating sweep with a roughly four-second rotation period
- phosphor-style return brightening when the sweep crosses a track, followed by persistence fade
- range rings labeled in nautical miles
- bearing marks around the bezel and live sweep-angle readout
- per-track bearing and range readouts such as `TRK 247° 31.4 NM`
- short track-history tails that show recent movement
- RAW, TRACK, CONFIRMED, and COAST visual states
- subtle clutter that increases with rain/storm conditions
- visible scope degradation when the Facility Command RADAR ARRAY is degraded or offline

The radar realism layer is presentation-only. Existing contact movement, sensor correlation, incident promotion, scoring, response logic, Facility Command, and archive behavior remain unchanged.

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

The smoke test covers radar projection/bearing/range helpers, sweep-angle wraparound, radar return-state classification, contact acquisition, multi-source correlation, Facility Command initialization, radar-array failure and repair, power reserve/load shedding, facility-gated investigation, facility events, incident progression, response resolution, case-file sensor provenance, archive persistence, and shift finalization.

## Persistence

Only resolved fictional case-file data is stored in browser `localStorage` under `blacksite-command.case-files.v1`. Facility Command state resets with each new shift. Radar presentation history is display-only and resets when the page reloads. No network request or external action is performed. If storage is blocked or unavailable, the game continues with a session-only archive.

## Project direction

The intended full game expands the station with deeper procedural incident chains, progression, related-case intelligence, long-term mysteries, tutorial/endless play, saves, and additional mobile/accessibility polish.

All present behavior is fictional and self-contained. The game does not perform real external actions.
