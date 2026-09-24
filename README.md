# Blacksite Command

Blacksite Command is a dependency-free browser command-station game built around a fictional classified surveillance and response loop:

**Detect → Correlate → Investigate → Respond → Contain → Report**

## Current playable baseline — v0.0.1

- live sector map with moving simulated contacts
- SIGINT-style station feed
- contact selection and source correlation
- confidence-gated assessments
- three explicit fictional response choices: Observe, Shadow, Contain
- procedural contacts with deterministic core simulation state
- five-minute shift clock, scoring, accuracy, and after-action grade
- keyboard-accessible contact controls and responsive narrow-screen layout
- dependency-free Node smoke test for core runtime transitions

## Run

Open `index.html` directly in a browser. No build step or server is required.

## Validate

```bash
npm run smoke
```

The smoke test checks initial contact creation, selection, correlation, response resolution, contact spawning, and shift finalization.

## Project direction

The intended full game expands the station into a layered command environment with radar, SIGINT, map/casework, assessments, responses, facility systems, weather/satellite/ground sensors, procedural multi-stage incidents, sectors, progression, archives, long-term mysteries, tutorial/endless play, saves, and mobile/accessibility polish.

All present behavior is fictional and self-contained. The game does not perform real external actions.
