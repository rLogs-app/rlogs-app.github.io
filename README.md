# rLogs Website

`rlogs-website` is the public, game-facing website for rLogs. It is a
separate repository from the capture/parser application so the site, parser,
plug-ins, and future backend can evolve independently.

The read-only parse browser is backed by the separate rLogs submission
service. Its regions, activities, scenes, and difficulties are derived from
accepted public reports, so new content does not require a hand-maintained
website list or a frontend rebuild. `/parses/?parse=<report-id>` opens the
server-generated share page; source `.rlog` artifacts remain private.

Set `VITE_RLOGS_API_BASE_URL` to the deployed submission-service origin at
build time. A production build without that value renders explicit unavailable
states; it never substitutes demo parses, profiles, or module inventories.
Discord accounts, per-device app tokens, immutable UID claims, account-scoped
profile discovery, recent activity, and scene rankings are backed by the
configured service.

The browser application remains intentionally static:

- it renders the privacy-reviewed version-1 `WebsitePayloadEnvelope` synced by rLogs;
- it browses server-replayed parse projections without exposing source logs;
- it renders authenticated, server-published UID profiles as My Profile;
- it shows recent submissions, recently seen players, and the top five completed
  runs per scene (with Stimen Remains limited to the highest submitted floor);
- it records the native module-optimizer smoke result without duplicating the
  Rust optimizer in TypeScript;
- it is deployable to GitHub Pages and contains no secrets, database, packet
  capture, or upload endpoint; authentication and storage stay in the separate
  API service.

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
  fixtures/                    source-only contract fixtures (excluded from builds)
  profiles/                    source-only profile fixtures (excluded from builds)
src/
  contracts/                   versioned package and parser-to-website boundaries
  features/
    module-optimizer/          optimizer web adapter and status
    profiles/                  authenticated published-profile loading
    account/                   My Profile and account connection controls
    home/                      recent activity and scene rankings
  styles/                      shared site styling
.github/workflows/             checks and GitHub Pages deployment
```

Feature-specific files stay in their feature folder. Shared transport contracts
belong in `src/contracts`; game data does not.

## Deployment boundary

GitHub Pages hosts only static browser assets. The site contains no API keys
and cannot accept uploads itself. The separately deployed RLogs submission
service owns private log ingestion, server replay, public/unlisted projections,
and its derived browse catalog. It also owns Discord OAuth, short-lived website
sessions, per-device app tokens, and immutable first-owner UID claims. Future
services may add:

- higher-volume abuse controls and moderation;
- server-side leaderboard materialization when catalog volume requires it.

The frontend will address that backend through a configurable API adapter, so
moving away from GitHub Pages will not require rewriting page features.

## Developer profile fixtures

Repository publishing remains a developer-only source-fixture path. Normal
users sign in, connect the desktop, and publish a sealed profile through the
authenticated API. To refresh a source fixture from a `current.profile.json`
created by rLogs, run:

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
prohibited-field boundary, routing, and size limits. Production builds
explicitly exclude `public/fixtures` and `public/profiles`.

For backwards-compatible testing, the command also accepts a bare sanitized
`WebsitePayloadEnvelope`. The native package is preferred because its request
digest can be verified before publication.

Use `--dry-run` instead of `--confirm-public` to validate without writing.

## Optimizer path

The Module Optimizer loads the signed-in user's most recently synced UID, or a
selected linked UID when several exist. It has no default character, demo
inventory, or browser file-import path. The canonical optimizer remains the
`rlogs-bpsr-module-optimizer` Rust crate in RLogs. The browser imports that
implementation through its WebAssembly wrapper, keeping native and browser
scoring behavior in one implementation.

## Privacy

The browser validator mirrors Core's prohibited-field boundary for passwords,
account/login containers, credentials, tokens, cookies, email/phone fields, and
private platform identity. Source fixtures are synthetic or sanitized and are
never copied into the production site.

## License

GNU Affero General Public License v3.0 only (`AGPL-3.0-only`).
