# rLogs Website

`rlogs-website` is the public, game-facing web testbed for rLogs. It is a
separate repository from the capture/parser application so the site, parser,
plug-ins, and future backend can evolve independently.

The read-only parse browser is backed by the separate rLogs submission
service. Its regions, activities, scenes, and difficulties are derived from
accepted public reports, so new content does not require a hand-maintained
website list or a frontend rebuild. `?parse=<report-id>#parse` opens the
server-generated share page; source `.rlog` artifacts remain private.

Set `VITE_RLOGS_API_BASE_URL` to the deployed submission-service origin at
build time. Without it, the site uses the public-safe demo fixtures under
`public/fixtures`. Accounts, rankings, and leaderboards are intentionally out
of this milestone.

The browser application remains intentionally static:

- it validates the version-1 `WebsitePayloadEnvelope` emitted by rLogs;
- it verifies the sealed `LocalProfilePackage` written by the desktop and
  extracts only its public website envelope;
- it browses server-replayed parse projections without exposing source logs;
- it imports and renders sanitized Blue Protocol: Star Resonance character
  profiles;
- it discovers hashed, developer-published profile packages without requiring
  an upload API or account authentication;
- it records the native module-optimizer smoke result without duplicating the
  Rust optimizer in TypeScript;
- it is deployable to GitHub Pages and contains no secrets, database, packet
  capture, authentication, or upload endpoint.

## Run locally

```text
npm install
npm run dev
```

Before committing:

```text
npm test
npm run check
npm run build
```

## Folder guide

```text
public/
  fixtures/                    sanitized payloads and test receipts
  profiles/                    indexed developer-published profile packages
src/
  contracts/                   versioned package and parser-to-website boundaries
  features/
    module-optimizer/          optimizer web adapter and status
    profile-lab/               profile import, validation, and rendering
  styles/                      shared site styling
.github/workflows/             checks and GitHub Pages deployment
```

Feature-specific files stay in their feature folder. Shared transport contracts
belong in `src/contracts`; game data does not.

## Deployment boundary

GitHub Pages hosts only static browser assets. The site contains no API keys
and cannot accept uploads itself. The separately deployed RLogs submission
service owns private log ingestion, server replay, public/unlisted projections,
and its derived browse catalog. Future services may add:

- opt-in identity linking and authentication;
- idempotent profile storage;
- higher-volume abuse controls and moderation;
- ranking calculations and leaderboard queries.

The frontend will address that backend through a configurable API adapter, so
moving away from GitHub Pages will not require rewriting page features.

## Developer profile publishing

Until the authenticated API exists, repository write access is the developer
authorization boundary. Publish an already-sanitized, user-approved
`current.profile.json` created by rLogs with:

```powershell
npm run profile:publish -- --input C:\path\profile.json --confirm-public
npm test
npm run check
npm run build
git add public/profiles
git commit -m "data: publish updated marierose profile"
git push
```

The publisher verifies the native package seal, sealed-log evidence shape,
prohibited-field boundary, routing, and size limits. It then discards local
source/session details and writes only the public profile envelope plus minimal
non-secret verification metadata. It refuses to write without
`--confirm-public`, does not read packet captures, and does not bypass the
public profile allowlist. A normal push deploys the result through GitHub
Pages; do not force-push.

For backwards-compatible testing, the command also accepts a bare sanitized
`WebsitePayloadEnvelope`. The native package is preferred because its request
digest can be verified before publication.

Each package is available at
`https://donneeee.github.io/rlogs-website/?profile=<character-uid>`. The
publisher derives this key from the envelope; character names are never used
as routes because they are not unique. The browser
validates the index, byte length, digest, envelope, and manifest routing before
rendering it. These packages are visibly developer-published test data, not
authenticated character claims.

Use `--dry-run` instead of `--confirm-public` to validate without writing.

The Profile Lab and module optimizer can also open `current.profile.json`
directly. That browser-only import never uploads or persists the file.

## Optimizer path

The canonical optimizer remains the
`rlogs-bpsr-module-optimizer` Rust crate in RLogs. The browser imports that
implementation through its WebAssembly wrapper, keeping native and browser
scoring behavior in one implementation.

## Privacy

The browser validator mirrors Core's prohibited-field boundary for passwords,
account/login containers, credentials, tokens, cookies, email/phone fields, and
private platform identity. The example fixture is synthetic. Developer profile
packages are sanitized, user-authorized public envelopes.

## License

GNU Affero General Public License v3.0 only (`AGPL-3.0-only`).
