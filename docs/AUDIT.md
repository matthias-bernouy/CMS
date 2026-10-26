# Repository Audit

Reviewed on 2026-10-25 against `codex/alpha-v0`, commit `0e660a3c4`.
This is a source-backed engineering assessment. Passing local checks does not
establish that the complete deployment or every failure mode has been tested.

## Follow-up status

The typed Content delivery follow-up introduces shared per-operation validators
at Provider and Kernel boundaries. The shallow-decoder observation below records
the reviewed revision; see [typed Content delivery](architecture/content-delivery.md)
for the current protocol and regression coverage. The remaining sections retain
the original audit context and are not a fresh validation of their current status.

## Assessment

The platform has coherent ownership, strict artifact admission and useful
deterministic work budgets. Its main weaknesses are delivery integration,
unbounded or oversized rendering state, partially typed Content delivery,
operational recovery and completion of the editorial journey. Preserve the
architecture while closing these gaps.

The supported deployment assumes one active Kernel per instance, one Provider
process and one active official-repository writer. Community publication and a
generic MCP binding are planned work, not implemented features of this revision.

## Inventory And Boundaries

There are 22 workspace packages: eight Foundation, eight features, two surfaces
and four runtimes. See the [package map](architecture/packages.md) for their
names and responsibilities. SEO belongs to `cms-content`; there is no separate
`cms-seo` package.

The authored official tree contains eight contract definitions, one Provider
manifest and the `ulvia-official` collection. Its current sources declare 98
Blocs and 15 Pages. These source counts do not prove publication, installation
or runtime availability; exact installed artifacts remain authoritative.

Dependencies flow `runtimes -> surfaces -> features -> foundation`.
`packages/official-repository` contains authored artifacts, not runtime wiring.
Kernel owns HTTP presentation and receives a read-only Content projection;
Provider owns persistence and the official implementations. Gateway executes
selected capabilities. Repository owns immutable artifacts and site
installation/selection models.

## Verification Evidence

The audit run produced:

- `bun run check:all`: ten checks passed, including architecture, types,
  logging, UI contracts and dead-code analysis;
- `bun run build`: passed;
- `bun test`: 2,382 passed, zero failed and one skipped after enabling the
  permissions needed by local HTTP servers and browser tests;
- the skipped test is the opt-in fresh-install Docker/Chromium journey;
  this audit did not establish a fresh pass for that journey;
- repository shape: 194 advisory file-size warnings, no directory-fanout errors;
- the dependency audit failed with two high-severity advisories in development
  tooling: Happy DOM 20.14.5 and Zod 4.6.5 through Knip.

The advisories are [Happy DOM](https://github.com/advisories/GHSA-834v-8h66-3h79)
and [Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). The identified uses
are test and analysis tooling; this is not evidence of public CMS exploitation.
Re-run the dependency audit when updating the lockfile.

## Confirmed Gaps

### Delivery And CI

The shared [setup action](../.github/actions/setup-workspace/action.yml) invokes
the removed `cms-kernel/src/tooling/prebuildAdmin.ts`; executing the command
fails with a missing-module error. Local `check:all` does not validate that step.

The [coverage baseline](../quality/ci/coverage/baseline.json) describes 19
packages, still includes `cms-seo` and omits logging, emailer, SMTP emailer and
secrets. The ratchet requires an exact package-set match.

The [fresh-install test](../packages/runtimes/ulvia-cli/tests/stack/kernel-smoke.browser.test.ts)
starts services from the unbundled CLI without a version. First startup now
requires an injected stack version or `--version`. Its container journey must
also identify and exercise images built from the candidate commit.
Push workflows target `master`; a push to `codex/alpha-v0` alone does not run
those workflows. Pull-request and manual triggers are separate.

### Rendering Work And Contracts

[PageRenderInputCache](../packages/runtimes/cms-kernel-server/src/runtime/content/delivery/PageRenderInputCache.ts)
has no entry or byte ceiling. Expiration revalidates rather than removes
entries, including missing paths. A controlled probe retained 5,000 distinct
missing-path snapshots. Bound memory, pending work and negative caching.

[Page render inputs](../packages/features/cms-content/src/application/core/pageRenderInputs.ts)
load the complete renderable Bloc catalogue. Provider delivery then includes
its behavior sources and collection text catalogues. A controlled empty-Page
fixture grew from 958 to 4,198,847 serialized bytes after adding 1,000 unused
Blocs with 4 KiB markup each. These are Provider-to-Kernel bytes, not measured
browser downloads or production latency. Add unused-resource byte/work budgets
alongside the existing unrelated-Page and request-count tests.

`ulvia.cms.content:delivery.read` describes `inputJson` and output string
`chunks`. The nested data is not fully described by capability schemas, and
the [Kernel decoder](../packages/runtimes/cms-kernel-server/src/runtime/content/delivery/protocol.ts)
uses shallow checks and type assertions. A probe accepted a current route with
`page: null`, numeric Bloc entries and numeric text values. Define and validate
the actual delivery projections before relying on independent runtime upgrades.

### Operations And Trust

CLI image upgrades, digest pins and best-effort image fallback exist. Falling
back to an older image does not revert data written by the newer image.
Internal persistence schemas do not yet share a versioned migration ledger.
Collection content migrations solve a different problem. Backup/restore,
historical-key recovery and interrupted upgrades need deployment-level drills.

Many adapter tests use Mongo doubles. They cover domain behavior but do not
prove real index, transaction, concurrency or interruption behavior. Preserve
them and add real-adapter tests plus container/proxy journeys.

Collection behavior runs as trusted JavaScript in the document. Namespace
signatures establish authorship, not code safety. Scoped CSS and static API
checks do not isolate JavaScript. A community deployment needs an explicit
execution-trust policy or an isolated execution design.

Cookie-authenticated mutations have no centralized Origin/Fetch Metadata
policy. `HttpOnly`, `Secure` and `SameSite=Lax` do not establish every request's
provenance. See [open platform work](TODO.md) for these activation gates.

## What Is Strong

- Architecture checks enforce package direction, exports, browser/server
  boundaries and environment-read restrictions.
- Contracts and manifests use canonical digests, exact pins, compatibility
  checks and explicit selections. Runtime observations cannot grant authority.
- Provider dispatch is sealed against admitted releases. Gateway validates
  declared schemas, identities, access and bounded transport; the Content JSON
  envelope limitation above remains an exception to full payload validation.
- Collections validate namespaced Blocs, native roots, slots, theme variables,
  assets, text references and dependency imports. Behavior is optional.
- Collection migrations have revision checks, maintenance fencing, batches,
  durable journals and recovery paths.
- Binary transport preserves streaming and provider-owned file semantics.
  Assets have immutable identities, bounded inspection and HTTP range support.
- Authentication and secrets remain Provider-owned. Kernel applies validated
  session effects without an authentication database or signing secret.
- Structured diagnostics propagate request IDs and record stages. Existing
  performance tests gate counts and bytes as well as measured durations.
- The CLI consumes pinned images; separate tooling builds and verifies image
  and CLI release artifacts.

## Product And Maintenance

Administration and public Pages share one model. The editor implements nested
slot-aware editing, native attributes, media selection, site-composition
creation and bounded local undo/redo. Preview uses the saved Page's ordinary
URL in a same-origin iframe. Structural edits need saving/reload; this is not
an isolated JavaScript sandbox or a complete unsaved-document renderer.

Starters, durable Page history, richer editing and the complete media/editor
failure journey remain incomplete. The [first published Page](product/first-published-page.md)
defines the product completion gate separately from implemented controls.

Dead-code checks found no unused declarations, files or dependencies within
their configured scope. That does not prove an absence of semantic duplication.
Review concentrated responsibilities in Content persistence, Gateway dispatch,
collection projection and publication storage; avoid mechanical file splitting.

## Recommended Sequence

1. Repair CI setup, coverage inventory, dependencies and candidate-image smoke.
2. Bound render caches and scope delivery to the Page's transitive resources.
3. Validate typed Content projections across Provider and Kernel versions.
4. Prove adapter concurrency, upgrade interruption and complete restore.
5. Complete one editorial journey, including conflict and media failure cases.
6. Establish publisher execution trust and browser mutation provenance before
   activating the corresponding community or deployment flows.

Implemented APIs, configured workflows, published releases and verified journeys
must remain distinct in documentation and release claims.
