# Optional Forms

`@bernouy/forms` owns configurable drafts, immutable publications, retained
submissions and notification intents. `ulvia/cms.forms@1.0.0` has fifteen
capabilities. Administration has HTTP and MCP bindings; public definition and
submission have HTTP bindings only. All eleven field kinds use closed typed
objects. No visual form editor or prefabricated collection is shipped.

## Selection

The official Provider offers Forms but fresh ordinary and Control instances do
not select it. Discover a ready exact candidate through Installations
`list-provider-installations`, then invoke `select-contract` with its
`installationId`, `contractId`, `version` and `digest`. Installations 1.6 adds
this generic administrator action over the existing domain service. It preserves
unrelated selections and validates approved implementations, readiness,
dependencies and the host's protected selections before committing. The exact
Installations 1.5 executor remains available for existing selections.

The official Forms implementation requires BASE `ulvia/cms.emailer` capability
`emailer.send`, range `^1.0.0`. The runtime invokes the currently selected
compatible Emailer through its existing verified Provider authority. Forms does
not select SMTP. A reviewed system upgrade can add the offered implementation
without selecting it. An existing explicit Forms selection is retained.

## Persistence and delivery

The Mongo adapter uses majority reads and journaled majority writes with atomic
single-document changes on standalone Mongo. Publication identifiers are source
revisions. A candidate becomes visible through the form head and is sealed before
a later publication advances it; earlier publications retain their exact draft.
Creation uses a caller-generated `formId`; submission uses an `attemptId` UUID.
Retained input/principal hashes distinguish exact retries from conflicting reuse.
An accepted receipt follows durable answer and notification-intent storage.

Notification states are `pending`, `sending`, `accepted`, `blocked`, `failed`
and `unknown`. A persisted send lease precedes transport invocation. A timeout or
expired lease becomes unknown, never an automatic resend. An administrator can
retry blocked/failed outcomes, and must accept duplicate risk for unknown ones.
Emailer acceptance does not prove inbox delivery. An already-started send may
complete after local deletion. A stalled transport retains its concurrency permit
until it settles, while logical worker shutdown can finish after its deadline.

Recovery scans at most fifty instance metadata records per ten-second tick and
opens an instance only when its indexed Forms work probe is due. Unused instances
do not receive Forms collections. The worker erases expired payload and
intents on its next due tick; opaque retry metadata has a seven-day replay window.
While the Provider is down, erasure waits for recovery or Mongo TTL, whose document
deadline is the later of payload expiry and replay expiry. TTL removal itself is
asynchronous. Private reads refuse expired payload immediately. This does not
promise erasure from external mailboxes or backups.

## Technical bounds and validation

There are no form, publication or submission count quotas. Request JSON and form
BSON have a 64 KiB representation bound; submission BSON has a 256 KiB bound,
including reserved intent growth. Lists read at most `limit + 1` projected records
with page sizes up to one hundred. Notification work reads at most twenty-five
records per tick, with eight outstanding transports per process and two per
instance. Per-form public admission allows six hundred attempts per minute;
this is a technical rate guard, not per-client fairness or a distributed ingress
limiter. No per-client protection is claimed by this change.

`bun run verify` includes `packages/features/forms/tests/mongo.test.ts` against
standalone Mongo and `tests/integration/instance/forms/journey.test.ts` against
local candidate images. The latter authors a test-only collection using existing
Content bindings, selects Forms through Installations, submits all field kinds
in Chromium, observes controlled SMTP delivery, checks private access refusals,
and restarts the Provider with retained notification work. The static performance
plan has real recipes for the new capabilities; timing campaigns remain the
separate `bun run perf` command.
