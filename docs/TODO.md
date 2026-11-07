# Open Platform Work

Status reviewed on 2026-11-04 against the current source. This list includes
remaining product and operational work. Historical measurements and audits
retain their original dates; they do not certify the current checkout. See
[development](development/README.md) for current commands and verification scope.

The intentionally incompatible redesign of contracts, Provider authority,
collection examples, Content delivery, SSR and the public Edge is tracked in
the [Platform V2 architecture plan](TODO/platform_v2.md). Security and
performance review guardrails for agents are tracked in the
[agent guardrails plan](TODO/gardes_fous.md).

Collection reuse, site-versus-collection ownership and authoring feedback from
the Quentin Bernouy reproduction are tracked in the
[collection authoring improvement plan](TODO/collection_authoring_reuse.md).
That plan distinguishes existing instructions from proposed CMS changes.

## Delivery And Verification

**Status:** static checks, build, ordinary tests, `verify:full` and dedicated
Docker image/instance/upgrade journeys are implemented. Recorded passes belong
to their tested revisions; they do not certify new source or images. Remote CI,
coverage reconciliation and dependency advisories remain separate verification
work. The removed CI prebuild, branch triggers and obsolete performance fixtures
are repaired; work budgets run in `verify`, with delivery Docker budgets in
`verify:full` and CI.
See [guardrails](development/guardrails.md) for implemented controls and limits.

- Reconcile the coverage baseline with current packages and source paths.
- Rerun the online advisory check against the updated dependency lockfile; the
  October audit does not establish the current advisory status.
- Extend real Mongo coverage beyond the implemented namespace ownership and
  PAT quota/concurrency tests: transactions, interruption and restoration still
  need environment-level evidence.

Exit condition: a clean checkout passes the complete delivery gate and one
fresh container/proxy journey against the software being reviewed.

## Rendering Budgets And Content Delivery

**Status:** rendering now belongs to Content behind native resource delivery.
The Edge response cache has explicit entry, byte and pending-load bounds.
The removed Edge render-input projection and its per-path cache are no longer
current architecture; origin-side dependency and cache costs still need review.

- Keep origin-side dependency reads and retained state bounded, including
  negative paths; do not reintroduce complete per-path render snapshots.
- Resolve the Page's transitive Bloc, behavior, text and asset dependencies
  before transfer. Adding unused resources must not increase its payload.
- Keep native delivery response validation and byte bounds explicit; Edge must
  not recover persistence-shaped render-input projections.
- Test revalidation failures, invalidation races and changes made outside the
  current Edge, and document the chosen freshness guarantees.

Exit condition: deterministic tests bound calls, bytes and retained resources
as unrelated Pages, Blocs and requested paths grow.

## Delivery Performance And Edge Cache

**Status:** phases 0–5 are implemented locally. Description caching uses exact
selection revisions; production Edge caches anonymous Pages and immutable
resources with bounded retention and explicit invalidation. The Docker journey
runs 420 requests across three image-capable Pages and administrator reads for
over two minutes, first without the cache and then with it. Hits require zero
Provider work and zero Mongo operations. Origin reads, compression, journal
batches and delegation/control preparation are reduced. Final verification
results and measured budgets are recorded in the plan. No release is published.

The measurements, decisions and phases are in the
[delivery performance plan](TODO/performance.md).

Exit condition: with the Edge cache disabled and enabled, no 503 at 200 views
per minute across several Pages using image-capable Blocs and administrator
reads; anonymous Edge cache hits perform no Provider call or Mongo operation;
purge-scope commands that complete, including selection changes, are visible
on the next request; unknown outcomes and other writes appear within 15 seconds
of the effective write.

## Internal Persistence Migrations

**Status:** collection upgrades use reviewed exact release switches and never
transform Page documents. Removed collection generation/migration formats have
no compatibility reader. Internal MongoDB documents do not share an ordered
schema-migration registry.

Add feature-owned, idempotent migrations with a durable applied-version ledger,
single-writer fencing and restart recovery before changing long-lived internal
schemas. Define the supported read/write compatibility window for each change.
An image rollback must not imply that the data has been rolled back.

Exit condition: upgrade with interruption, resume, compatible image fallback
and complete restoration are exercised against real persistence.

## Backup And Operational Recovery

**Status:** the CLI preserves persistent state across stops and pins exact
images. A failed upgrade attempts to restore the previous image; there is no
general data-rollback or automated backup/restore command.

Exercise complete backups containing MongoDB, file blobs, Repository state,
instance definitions and matching encryption material. Restore to an isolated
installation and verify credentials, Pages, routes, media and exact artifact
pins. Test missing historical keys, interrupted publication, proxy/TLS behavior
and shutdown while work is active. Diagnostic logs do not replace durable
domain audit records or recovery evidence.

## Collection JavaScript Isolation

**Status:** collection JavaScript executes as trusted code in the Edge
document. The MVP's reviewed first-party release assumption is an operational
trust policy, not a technical publisher allowlist or a sandbox.

Community publication and installation need separate decisions about execution
authority. Account-owned namespace authorization and verified release digests
provide publishing authority and integrity, rather than browser code isolation.
Static API checks and scoped CSS provide validation and encapsulation only.

Two designs need explicit evaluation before activation:

- site approval of main-document execution for an exact publisher and release
  digest, with clear browser authority and upgrade acknowledgements;
- an isolated runtime with bounded host-mediated effects for code that must
  not receive the surrounding document or ambient browser authority.

A lazy Worker or equivalent realm per immutable collection release is a
candidate for the second design, not an adopted collection protocol. Prototype
DOM interaction, mixed-collection slots, native forms, focus, accessibility and
failure handling first. Avoid one visible iframe per ordinary Bloc instance.
Visible sandboxed iframes remain useful for autonomous embeds.

Exit condition: the selected trust model is explicit and tested. If isolation
is claimed, demonstrate cross-collection separation, declared effects, bounded
messages, timeouts and termination without breaking the host Page.

## Browser Mutation Provenance

**Status:** the session cookie is `HttpOnly`, `SameSite=Lax` and secure on HTTPS,
but the generic capability boundary does not enforce one centralized
`Origin`/`Sec-Fetch-Site` policy for cookie-authenticated commands.

Define a Edge-boundary policy covering logical mutations and canonical
binding routes. Preserve bearer clients and native multipart uploads;
distinguish absent headers from an explicit foreign origin. Verify same-site
cross-origin cases, proxy/TLS deployment and authentication effects. Request
provenance complements actor authorization; no capability-specific CSRF rules
or Page/Referer grants are required.

## Editorial Completion

**Status:** nested editing, native fields, a media picker, site compositions
and local undo/redo exist. The end-to-end product gate is incomplete.

Complete [the first published Page](product/first-published-page.md), including
starters, media selection, alternative text, saved-preview correctness,
publication and restart. Exercise two-tab conflicts, interrupted uploads,
rejected saves and leaving with unsaved edits. Local editor undo is not durable
Page history. Dynamic-data authoring remains outside this initial slice.

## High Availability

**Status:** one active Edge per instance, one Provider process and one active
Repository writer are assumed. Leases protect implemented critical
sections; multi-replica failover is not proven. Unconsumed delegation roots live
in one Provider process, and root liveness/queued closures live in one Edge
process. Replicas or restarts lose that local context and refuse those calls.
Removing this limit requires shared ownership/liveness and cross-replica tests,
in addition to distributed response-cache invalidation. Multiple isolated CMS
sites within the supported process topology remain supported.

Treat horizontal replicas as unsupported until migrations, background jobs,
publication, cache invalidation and recovery have split-brain and
ownership-loss tests. Account-owned namespaces and the generic MCP binding are
implemented; they do not establish multi-replica deployment guarantees.
