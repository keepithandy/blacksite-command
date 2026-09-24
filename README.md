# Blacksite Command

Blacksite Command is a dependency-free browser command-station game built around a fictional classified surveillance and response loop:

**Detect → Correlate → Investigate → Respond → Contain → Report**

## Current playable baseline — v0.0.4

- live sector map with moving simulated contacts
- four sensor-source classes: RADAR, SIGINT, SATELLITE, and GROUND
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
- dependency-free Node smoke coverage for runtime, sensor, facility, incident, and archive transitions

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

The smoke test covers contact acquisition, multi-source correlation, Facility Command initialization, radar-array failure and repair, power reserve/load shedding, facility-gated investigation, facility events, incident progression, response resolution, case-file sensor provenance, archive persistence, and shift finalization.

## Persistence

Only resolved fictional case-file data is stored in browser `localStorage` under `blacksite-command.case-files.v1`. Facility Command state resets with each new shift. No network request or external action is performed. If storage is blocked or unavailable, the game continues with a session-only archive.

## Project direction

The intended full game expands the station with deeper procedural incident chains, progression, related-case intelligence, long-term mysteries, tutorial/endless play, saves, and additional mobile/accessibility polish.

All present behavior is fictional and self-contained. The game does not perform real external actions.
