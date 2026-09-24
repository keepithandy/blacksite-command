# Blacksite Command

Blacksite Command is a dependency-free browser command-station game built around a fictional classified surveillance and response loop:

**Detect → Correlate → Investigate → Respond → Contain → Report**

## Current playable baseline — v0.0.2

- live sector map with moving simulated contacts
- SIGINT-style station feed
- contact selection and source correlation
- multi-stage incidents: Acquisition → Correlation → Assessment → Resolution
- incident history that records when each stage was reached
- confidence-gated assessments and three fictional response choices: Observe, Shadow, Contain
- automatic case-file generation when incidents resolve
- local persistent case archive that survives reloads when browser storage is available
- session-only fallback when browser storage is unavailable
- archive continuity across new shifts with non-colliding incident IDs
- five-minute shift clock, scoring, accuracy, and after-action grade
- keyboard-accessible contact controls and responsive narrow-screen layout
- dependency-free Node smoke test for runtime and archive transitions

## Run

Open `index.html` directly in a browser. No build step or server is required.

## Validate

```bash
npm run smoke
```

The smoke test checks initial contact creation, incident promotion, stage progression, response resolution, case-file generation, archive export/import isolation, incident ID continuity, contact spawning, and shift finalization.

## Persistence

Only resolved fictional case-file data is stored in browser `localStorage` under `blacksite-command.case-files.v1`. No network request or external action is performed. If storage is blocked or unavailable, the game continues with a session-only archive.

## Project direction

The intended full game expands the station into a layered command environment with radar, SIGINT, map/casework, assessments, responses, facility systems, weather/satellite/ground sensors, procedural multi-stage incidents, sectors, progression, archives, long-term mysteries, tutorial/endless play, saves, and mobile/accessibility polish.

All present behavior is fictional and self-contained. The game does not perform real external actions.
