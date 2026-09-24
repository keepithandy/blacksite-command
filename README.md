# Blacksite Command

Blacksite Command is a dependency-free browser command-station game built around a fictional classified surveillance and response loop:

**Detect → Correlate → Investigate → Respond → Contain → Report**

## Current playable baseline — v0.0.3

- live sector map with moving simulated contacts
- four sensor-source classes: RADAR, SIGINT, SATELLITE, and GROUND
- sector-specific sensor coverage and effectiveness
- time-limited satellite passes that move between sectors
- CLEAR / WIND / RAIN / STORM conditions that change sensor reliability
- temporary degraded/offline sensor events with automatic recovery
- contact filtering by recorded sensor source
- cross-sensor correlation where independent sources directly improve confidence
- two-source minimum for response authorization and incident promotion
- three-source fusion requirement for confirmed assessment stage
- SIGINT-style station feed with sensor and weather events
- multi-stage incidents: Acquisition → Correlation → Assessment → Resolution
- automatic case-file generation with retained sensor provenance
- local persistent case archive that survives reloads when browser storage is available
- session-only fallback when browser storage is unavailable
- five-minute shift clock, scoring, accuracy, and after-action grade
- keyboard-accessible controls and responsive narrow-screen layout
- dependency-free Node smoke coverage for runtime, sensor, incident, and archive transitions

## Sensor Network

Every shift creates sector coverage for North Ridge, Dry Lake, Echo Valley, West Range, and Salt Flats.

RADAR, SIGINT, and GROUND nodes are persistent sector assets. SATELLITE coverage is orbital and only contributes while its timed pass is over a sector. Weather modifies the effective reliability of every sensor source. Network events can temporarily degrade or take a sector sensor offline; it automatically recovers after its outage window.

Contacts retain the sources that actually detected or corroborated them. Correlation quality progresses from:

**single-source → supported → multi-source → fused**

The existing incident system uses that provenance rather than treating correlation as a flat button press.

## Run

Open `index.html` directly in a browser. No build step or server is required.

## Validate

```bash
npm run smoke
```

The smoke test covers contact acquisition, sensor-source matching, multi-source correlation, incident progression, response resolution, case-file sensor provenance, sensor outages/recovery, weather events, satellite cycling, archive persistence, and shift finalization.

## Persistence

Only resolved fictional case-file data is stored in browser `localStorage` under `blacksite-command.case-files.v1`. No network request or external action is performed. If storage is blocked or unavailable, the game continues with a session-only archive.

## Project direction

The intended full game expands the station into a layered command environment with facility systems, deeper procedural incident chains, progression, related-case intelligence, long-term mysteries, tutorial/endless play, saves, and additional mobile/accessibility polish.

All present behavior is fictional and self-contained. The game does not perform real external actions.
