# Open Platform Work

Status reviewed on 2026-10-25 against `codex/alpha-v0`. This list includes
confirmed defects and deliberately deferred work. None of the completion
criteria below describe an implemented guarantee. See the [audit](AUDIT.md)
for evidence and priorities.

The intentionally incompatible redesign of contracts, Provider authority,
collection examples, Content delivery, SSR and the public Edge is tracked in
the [Platform V2 architecture plan](TODO/platform_v2.md).

## Delivery And Verification

**Status:** static checks, build and ordinary tests pass locally; complete CI
and fresh-container verification have known blockers.

- Replace the removed prebuild tool in the shared GitHub setup action.
- Reconcile the coverage baseline with current packages and source paths.
- Update the two high-severity development-tooling dependencies identified by
  the audit, then rerun the online advisory check.
- Supply an explicit stack version to the unbundled fresh-install smoke and
  prove that its images come from the candidate commit.
- Align branch triggers with the active delivery branch and avoid redundant
  executions of the same smoke journey.
- Add real Mongo adapter tests for index uniqueness, concurrent writes,
  transactions where supported and recovery after interruption.

Exit condition: a clean checkout passes the complete delivery gate and one
fresh container/proxy journey against the software being reviewed.

## Rendering Budgets And Content Delivery

**Status:** request coalescing, revision checks, stale revalidation and several
request/byte budgets exist. Page render inputs still include the complete Bloc
catalogue, and their per-path cache has no capacity bound.

- Bound cache entries, retained bytes and concurrent pending loads; handle
  negative paths without retaining a full snapshot for every arbitrary URL.
- Resolve the Page's transitive Bloc, behavior, text and asset dependencies
  before transfer. Adding unused resources must not increase its payload.
- Give each Content delivery projection a validated wire schema. String chunks
  containing JSON do not validate the nested object or its upgrade compatibility.
- Test revalidation failures, invalidation races and changes made outside the
  current Kernel, and document the chosen freshness guarantees.

Exit condition: deterministic tests bound calls, bytes and retained resources
as unrelated Pages, Blocs and requested paths grow.

## Internal Persistence Migrations

**Status:** collection-owned content migrations are implemented. Internal
MongoDB documents do not share an ordered schema-migration registry.

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

**Status:** collection JavaScript executes as trusted code in the Kernel
document. The MVP's reviewed first-party release assumption is an operational
trust policy, not a technical publisher allowlist or a sandbox.

Community publication and installation need separate decisions about execution
authority. A namespace signature proves ownership and integrity, not safety.
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

Define a Kernel-boundary policy covering logical mutations and canonical
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

**Status:** one active Kernel per instance, one Provider process and one active
official-repository writer are assumed. Leases protect implemented critical
sections; multi-replica failover is not proven.

Treat horizontal replicas as unsupported until migrations, background jobs,
publication, cache invalidation and recovery have split-brain and
ownership-loss tests. Community namespaces and the generic MCP binding remain
planned work; they do not change the current deployment guarantees.
