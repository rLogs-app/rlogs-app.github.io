# Public website fixtures

- `bpsr-character-profile.v1.json` is a synthetic contract example.
- `bpsr-local-profile-package.v1.json` is a synthetic native-package example
  with a reproducible cross-runtime request seal.

User-authorized developer profile packages live under `public/profiles/`, not
in the fixture folder. They are indexed, hashed, and loaded through the same
versioned website-payload and local-package validators used for local imports.

Source captures remain private and are never website artifacts.

`parse-catalog.v1.json`, `parse-report.v1.json`, and
`parse-reconciliation.v1.json` are public-safe browser fixtures for the
submission-service contract. The timeline fixtures include the complete
reducer-authored eDPS/aDPS rate clock, including frozen inactivity intervals.
The report and reconciliation fixtures also cover exact, matching multi-POV,
conflicting, and missing combat loadout evidence without inventory instance IDs.
`timeline-rdps-cursor.v1.json` isolates cumulative rDPS playback across a
recovery pause and distinguishes exact from incomplete attribution.
Production builds can set
`VITE_RLOGS_API_BASE_URL`; the browser then reads live server-generated
catalog and report projections instead of these files.
