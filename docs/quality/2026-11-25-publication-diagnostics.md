# Publication refusal diagnostics — 2026-11-25

## Scope and diagnosis

The Repository client now preserves bounded HTTP refusal facts, recognized remote
codes, a safe request ID and the failed upload phase. Collection publication
reasons still use local fixed text; arbitrary remote messages never become CLI
output. `PublicationPushError` adds the exact coordinate, receiving origin and batch
progress. The distribution entry point renders this diagnostic and exits 1 before
Docker/npm publication. Completed resources remain published and exact retry stays
idempotent. No contract schema, release version or publication ordering changed.

The built `ulvia/cms.access@1.2.0` is accepted by the current contract parser and
passes evolution against the public `ulvia/cms.access@1.1.0` metadata read on this
date. The parser from `v1.0.22` rejects these same bytes with
`$.events: unknown property "events"`. The public Repository returned 404 for
Access 1.2.0 and 200 for 1.1.0. Its retained rejection journal contains only
`REJECTED`, so these observations do not establish its actual running build or
exclude another refusal. The event compatibility guidance is explicitly a possible
cause, not a remotely confirmed diagnosis. Catalogue publication does not update
its receiving runtime. No remote publication or deployment was attempted.

## Validation

- Initial and final `bun run check`: ten gates passed.
- Publication/refusal/batch/distribution tests: 30 passed, 180 assertions.
- Shared Repository HTTP transport and immutable publication tests: 63 passed,
  330 assertions.
- Final source-build and push regression tests: 54 passed, 274 assertions.
- Full `bun run verify`: exit 0; 4,703 general tests passed, 164 gated skips,
  zero failures. Real Mongo regressions, the historical crash-upgrade journey
  (250 assertions), account/delivery journeys, the browser stack journey
  (2,499 assertions) and fresh/restart TLS journeys (18/19 assertions) passed.

The last source-build phase labels are message-only changes made during the full
run and separately exercised by the source-build and push regression tests.
The CLI push files share one responsibility directory to retain the existing
8-entry remote-command boundary. The test push directory now has eight entries;
this is informational and the tests remain cohesive.

## Safety and cost

Successful transfers add no network or persistence operations. Error parsing retains
the existing 4,096-byte, depth-8 and 100-ms diagnostic bounds and body release.
Unknown codes, malformed/oversized responses, unsafe request IDs and arbitrary
remote messages do not become trusted guidance. Authentication and generation
checks, immutable admission and retry semantics remain unchanged. Tests cover
no-publication refusals, saved credential fences and repeat publication without
replacement. There is no new instance-scoped mutation or authorization grant.
The direct, zero-asset writer still makes four HTTP requests: one identity check
and one write for each of upload preparation and commit. This change adds zero
network requests or persistence lookups. The event hint reparses an already admitted local contract only on an opaque 409.

An older server can remove the reason before sending its response or recording its
journal; the client cannot recover that information. Updating a receiver for a new
contract language is separate from publishing its catalogue, and is not performed
by this change.
