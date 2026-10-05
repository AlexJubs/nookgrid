# No-signup streak protection

NookGrid keeps gameplay offline. Save protection, recovery and verification are separate from the streak timing rule. The current UTC puzzle schedule and existing streak calculation are unchanged. A later decision about rolling timers needs its own product change and regression tests.

## Implemented boundaries

- Native Preferences retains the existing progress keys, hints, elapsed time and privacy choices. A versioned checksummed journal commits progress, streak dates and the verification queue as one logical transaction. An atomic Application Support file and the previous good journal recover interrupted or damaged Preferences saves. Checksums detect accidental corruption; they are not an anti-cheating signature. Native hydration failure shows Retry rather than switching to WKWebView storage. Retry hydrates and reloads before another save can overwrite recovered progress.
- Existing date arrays remain history, explicitly unverified. New qualifying offline completions have stable event IDs and a durable retry queue. Tutorial/archive solves do not enter that queue. The calendar can recover completion checkmarks from history without fabricating boards, hints or elapsed time.
- `NSUbiquitousKeyValueStore` stores a compact recovery document containing legacy/unverified dates and a signed server snapshot. Local play never waits for cloud traffic. External-change notifications and foreground retries merge later arrivals. Empty history is never uploaded. Additive per-player keys let new users save while cloud initialization is pending, without overwriting a different recovered identity. A provisional identity can adopt later cloud/Keychain recovery, archiving its original records and retrying its recent completion events. Once cloud-bound, account mismatches preserve local history and suspend cloud writes. Cloud scheduling is not proof of a successful upload; unsynced changes remain vulnerable to deletion.
- A random player ID and 256-bit credential live in synchronizable Keychain items. They are separate from the optional analytics installation ID and are never returned to the web game. Recovery requires the same iCloud account; continuing its verified identity also requires iCloud Keychain to deliver the credential. A snapshot arriving first is retained while credentials are pending. Device App Attest keys are enrolled again after reinstall; they do not serve as the recoverable identity.
- The Node service uses SQLite WAL with full synchronization, hashed credentials, expiring one-time challenges, Apple App Attest validation, increasing assertion counters, bound request bodies and idempotent events. A completion is accepted only for the server's current UTC puzzle and a correct board. Device timestamps, arbitrary counts, legacy arrays and historical offline claims cannot create server credit. A same-day offline completion can be accepted when reconnected; a late completion stays local history. That is the existing timing policy, isolated in `utcDailyPolicy`, not a new 24/36-hour rule.
- The service signs its canonical completion facts with an Ed25519 private key. The app pins only its public key, validates player identity, request challenges and revisions, and rejects modified signatures and rollbacks relative to its last good snapshot. The verified streak uses only those facts and the signed server date, rather than the phone clock. Local history is retained separately and labelled when its count differs. Cached signatures establish authenticity as of issuance, not freshness; reconnect retrieves the canonical server record.

The bundled puzzles include solutions. Verification protects canonical dates and records, and establishes that the request came from an attested app; it cannot prove a human solved unaided. Neither iCloud nor local checksums make arbitrary imported history verified. A compromised/jailbroken client can misrepresent its own UI; it cannot mint a server signature.

## Activation is a separate deployment step

Default builds, including production, have streak networking and iCloud recovery off. Debug, simulator, live-reload and `?test=1` also reject native service/iCloud access. Automated tests use local fakes, test signing keys and an isolated loopback HTTP service. No production endpoint or private signing key is checked in.

The current repository has static here.now hosting and no existing backend. Run the portable Node service on Node 22.12+ on an owner-selected host with a persistent volume, HTTPS reverse proxy and backups. Never deploy `server/` through the static public-file publisher. The HTTP service binds loopback by default and serves API routes only. At a proxy, apply ingress rate limits and body/time limits; the service uses socket-level limits and deliberately does not trust arbitrary forwarded addresses. Run one service instance per SQLite database; replicas need a transactional shared database adapter.

Set command-scoped server environment values:

| Name | Purpose |
| --- | --- |
| `NOOKGRID_STREAK_DATABASE` | Private persistent SQLite path outside the checkout |
| `NOOKGRID_STREAK_SIGNING_KEY_FILE` | Private Ed25519 PKCS#8 signing key file outside source/build output |
| `NOOKGRID_APPLE_TEAM_ID` | Owner's personal Apple team ID, not an employer team |
| `PORT`, `NOOKGRID_STREAK_BIND` | Optional listener settings; default `127.0.0.1:8787` |

Start with `npm run streak:server`. Restrict key/database file permissions and back up the database consistently using SQLite's backup facilities. Preserve the private signing key securely; changing it requires a reviewed app public-key migration. Keep functional records private and implement the owner's retention/deletion process before live delivery. API request bodies contain authentication credentials: never log them at the host or reverse proxy.

The owner must enable iCloud Key-Value Storage and App Attest for the existing personal `com.nookgrid.app` identifier and regenerate the matching profiles. `App.entitlements` contains identifier-prefix placeholders, no team selection. App Attest development certificates are rejected by the production service. A signed physical Release/TestFlight build is required for the real integration check.

Build a configured app only after the service and public key are ready:

```sh
NOOKGRID_PRODUCTION=1 \
NOOKGRID_STREAK_ENDPOINT=https://owner-selected-verification-host/ \
NOOKGRID_STREAK_PUBLIC_KEY=public-SPKI-key-in-base64 \
npm run build:ios
```

The endpoint and public key must be configured together. Clear these variables and run `npm run build:ios` to restore offline QA assets. The current TestFlight launcher does not silently enable this feature; its activation and public configuration need a separately reviewed release setup. Reconcile App Store privacy answers with the functional player identifier/completions and the included privacy manifest before distribution.

## Verification

`tests/save-recovery.test.mjs` reproduces interrupted completion writes, damaged journal recovery and forbidden WebView fallback. `tests/native-storage.test.mjs` covers ordering, failure/retry and flush. `tests/streak-protection.test.mjs` covers offline persistence, reinstall recovery, delayed cloud arrival, signature edits, rollback, account changes and QA isolation. `tests/streak-server.test.mjs` uses actual P-256 assertion signatures to check the server validator, authenticated recovery, replay, expiry, clock manipulation, incorrect/old/future puzzles, canonical Ed25519 signatures and database restart. Enrollment uses a test verifier; those tests do not certify Apple's real attestation service. `scripts/build-ios.test.mjs` checks explicit configuration and default isolation.

Browser daily streak regressions cover shared gameplay, UTC boundaries, legacy saves and retries. `testAtomicJournalRecoversHintAndBoardWhenPreferencesAreLost` adds actual native-file recovery to the existing restart/hint/streak suite. Run the complete local release gate and exact-source web/iOS CI. Physical Apple integration remains separate: initial cloud synchronization for a new user; offline progress and delayed verification; two devices; reinstall with the same iCloud account; KVS arriving before Keychain; iCloud/Keychain disabled; account changes; quota/failure; production attestation enrollment/re-enrollment; lost enrollment responses; and confirmed server facts after recovery. Never count mocks or simulator checks as successful live iCloud recovery.
