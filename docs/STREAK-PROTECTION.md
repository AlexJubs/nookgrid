# No-signup streak protection

NookGrid keeps gameplay offline. Save protection, recovery and verification are separate from the streak timing rule. The current UTC puzzle schedule and existing streak calculation are unchanged. A later decision about rolling timers needs its own product change and regression tests.

## Implemented boundaries

- Native Preferences retains the existing progress keys, hints, elapsed time and privacy choices. A versioned checksummed journal commits progress, streak dates and the verification queue as one logical transaction. An atomic Application Support file and the previous good journal recover interrupted or damaged Preferences saves. Backup recovery preserves a newer analytics refusal still present in Preferences; an intact current journal retains a later explicit opt-in. Checksums detect accidental corruption; they are not an anti-cheating signature. Native hydration failure shows Retry rather than switching to WKWebView storage. Retry hydrates and reloads before another save can overwrite recovered progress.
- Existing date arrays remain history, explicitly unverified. New qualifying offline completions have stable event IDs and a durable retry queue. Tutorial/archive solves do not enter that queue. The calendar can recover completion checkmarks from history without fabricating boards, hints or elapsed time.
- `NSUbiquitousKeyValueStore` stores a compact recovery document containing legacy/unverified dates and a signed server snapshot. Local play never waits for cloud traffic. External-change notifications and foreground retries merge later arrivals. Empty history is never uploaded. Additive per-player keys let new users save while cloud initialization is pending, without overwriting a different recovered identity. A provisional identity can adopt later cloud/Keychain recovery, archiving its original records and retrying its recent completion events. Once cloud-bound, account mismatches preserve local history and suspend cloud writes. Key-value recovery is independent of iCloud Drive Documents; it uses the key-value store’s own scheduling result rather than a Drive identity token. Cloud scheduling is not proof of a successful upload; unsynced changes remain vulnerable to deletion.
- A random player ID and 256-bit credential live in synchronizable Keychain items. They are separate from the optional analytics installation ID and are never returned to the web game. Recovery requires the same iCloud account; continuing its verified identity also requires iCloud Keychain to deliver the credential. A snapshot arriving first is retained while credentials are pending. Device App Attest keys are enrolled again after reinstall; they do not serve as the recoverable identity.
- The Node service uses SQLite WAL with full synchronization, hashed credentials, expiring one-time challenges, Apple App Attest validation, increasing assertion counters, bound request bodies and idempotent events. Version 2 verifies a correct, previously uncredited released puzzle against a canonical personal play day, using server time and the device’s IANA timezone in the attested request. Archive solves can qualify; replays, Tutorial and future puzzles cannot. Each play day adds at most one streak credit. Version 1 UTC records migrate without deleting their facts; legacy requests cannot add UTC credit after migration. Device timestamps, arbitrary counts, unsigned history and historical offline claims cannot backdate server credit. Offline play remains available, but only reconnection during the matching canonical play day can verify it; late history stays explicitly local.
- The service signs its canonical completion facts with an Ed25519 private key. The app pins only its public key, validates player identity, request challenges and revisions, and rejects modified signatures and rollbacks relative to its last good snapshot. The verified streak uses the signed canonical calendar state and server time; a phone clock cannot add verified credits. Local predictions are stored separately and cannot become a verified count merely by being uploaded to iCloud. Local history is retained separately and labelled when its count differs. Cached signatures establish authenticity as of issuance, not freshness; reconnect retrieves the canonical server record.

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

Build a configured app only after the service and public key are ready. Production builds also require the command-scoped analytics capture configuration described in [RELEASING.md](RELEASING.md#private-analytics-configuration); keep its value in private release configuration.

```sh
NOOKGRID_PRODUCTION=1 \
NOOKGRID_STREAK_ENDPOINT=https://owner-selected-verification-host/ \
NOOKGRID_STREAK_PUBLIC_KEY=public-SPKI-key-in-base64 \
npm run build:ios
```

The endpoint and public key must be configured together. Clear these variables and run `npm run build:ios` to restore offline QA assets. The current TestFlight launcher does not silently enable this feature; its activation and public configuration need a separately reviewed release setup. Reconcile App Store privacy answers with the functional player identifier/completions and the included privacy manifest before distribution.

## Verification

`tests/save-recovery.test.mjs` reproduces interrupted completion writes, damaged journal recovery and forbidden WebView fallback. `tests/native-storage.test.mjs` covers ordering, failure/retry and flush. `tests/streak-protection.test.mjs` covers offline persistence, reinstall recovery, delayed cloud arrival, signature edits, rollback, account changes and QA isolation. `tests/streak-server.test.mjs` uses actual P-256 assertion signatures to check the server validator, authenticated recovery, replay, expiry, clock manipulation, incorrect/old/future puzzles, canonical Ed25519 signatures and database restart. Enrollment uses a test verifier; those tests do not certify Apple's real attestation service. `scripts/build-ios.test.mjs` checks explicit configuration and default isolation.

Browser daily streak regressions cover shared gameplay, UTC puzzle boundaries, local streak boundaries, legacy saves and retries. `tests/streak-policy.test.mjs` covers midnight, DST, travel in both directions and backwards clocks; `tests/reminders.test.mjs` covers opt-in permissions, cancellation and copy rotation; `tests/e2e/reminders.spec.mjs` covers native Settings, solve cancellation, archive credit and permission recovery. `testAtomicJournalRecoversHintAndBoardWhenPreferencesAreLost` adds actual native-file recovery to the existing restart/hint/streak suite. Run the complete local release gate and exact-source web/iOS CI. Physical Apple integration remains separate: initial cloud synchronization for a new user; offline progress and delayed verification; two devices; reinstall with the same iCloud account; KVS arriving before Keychain; iCloud/Keychain disabled; account changes; quota/failure; production attestation enrollment/re-enrollment; lost enrollment responses; and confirmed server facts after recovery. Never count mocks or simulator checks as successful live iCloud recovery.


## Personal play days and reminders

The basic rule matches Duolingo’s published daily activity model: complete a new released puzzle each play day. There are no freezes, purchases or signup in this feature. A play day normally ends at midnight in the device’s timezone. Changing timezone keeps the existing deadline; the new zone takes effect at that boundary. If the resulting transition day would be shorter than 20 hours, it ends at the following midnight instead. This is NookGrid’s explicit travel policy; Duolingo does not publish its complete date-line algorithm. Multiple solves in a day can add puzzle history, but only one streak credit. Previously solved puzzles and Tutorial cannot earn another credit.

Native Preferences plus the atomic journal store `play-days` alongside progress and queued verification events. iCloud recovery carries the local calendar as an unsigned prediction and the canonical calendar inside the signed snapshot. Existing puzzle dates remain intact. Unsigned/legacy counts are never promoted to verified records.

Local iOS notifications use `UNUserNotificationCenter`; they need neither an APNs server nor a NookGrid account. Daily reminders default to 8 PM with a noon–10 PM selector. Streak warnings arrive one hour before the actual uncredited day’s deadline. A solve removes that day’s pending reminders and creates a warning for the following day. Only the next genuine expiry warning is scheduled, so later notifications cannot advertise an already expired streak. Daily copy uses the 50 original messages in `public/reminder-messages.mjs`, shuffled without repeats within a cycle. Existing scheduled copy survives refreshes.

The app schedules up to 30 daily reminders and one streak warning, replenishing on launch, foreground, solve and Settings changes. Reminders therefore pause after 30 days without opening the app. Opening the app refreshes timezone changes; an existing active deadline remains valid while travelling. Delivery is subject to iOS notification permissions, Focus and system scheduling. Debug/live-reload/`?test=1` never request permission or schedule real notifications. The production Settings test button requests permission when needed and schedules one preview in 10 seconds, including a foreground banner. Notification preferences remain local.

Physical acceptance checks remain required: install the new TestFlight build; allow and deny permission; test lock-screen and foreground previews; change reminder time; complete a puzzle before both reminders; reopen after offline play, timezone/DST changes and app termination; confirm no obsolete pending warning arrives. Simulator and browser mocks do not establish phone delivery. Shipping the source to GitHub does not update an installed TestFlight build.
