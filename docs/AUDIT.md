# Repository Audit

This audit describes the CmsCore repository as reviewed on 2026-10-08. It is a
source-backed engineering assessment, not a security certification or a claim
that every production failure mode has been exercised.

## Executive Assessment

CmsCore now has a coherent platform core. The dependency direction is enforced,
immutable contracts and collection releases have strict admission rules, CMS
Core capabilities are sealed at startup, collection migrations are recoverable,
and Control is rendered from collection-owned Pages rather than a second static
application model.

The repository is suitable for continued product development and a controlled
single-runtime deployment. It should not yet be described as ready for a
critical, horizontally scaled production service. The remaining risks are
mostly long-lived compatibility, operational recovery, provider conformance and
deployment validation rather than unclear ownership between packages.

## Verified Shape

The workspace contains 18 packages:

- seven Foundation packages;
- five feature packages: authentication, content, files, gateway and repository;
- three surfaces: CMS Core, Control and Delivery;
- three executable runtimes: CMS server, official repository server and CLI.

The official repository currently contains:

- eight `ulvia.cms.*` Core contracts with 43 capabilities;
- one future provider-only CMS-instance contract that the local Core provider
  does not claim;
- the `ulvia.official` provider manifest;
- the `ulvia-official` collection with 141 Bloc definitions, 119 theme tokens
  and seven Control Pages covering the eight Core domains.

The supported package dependency direction is:

```text
runtimes -> surfaces -> features -> foundation
```

`packages/official-repository` is an authored product tree, not a runtime
dependency layer. `@bernouy/official-repository-server` is the independent
runtime that admits and serves its immutable artifacts.

## Validation Evidence

The final review run completed with:

- all nine `check:all` diagnostics passing;
- the complete workspace build passing;
- more than 2,100 tests passing, no failure and one explicitly opt-in fresh-install
  browser smoke test skipped;
- all tracked relative Markdown links resolving;
- no whitespace error in the resulting patch.

Repository-shape diagnostics remained advisory, with no blocking
directory-fanout error. CI separately runs the high-severity dependency
advisory audit because it requires current registry access.

## What Is Strong

### Architecture And Ownership

- Automated checks reject reversed package dependencies, workspace cycles,
  undeclared exports, cross-package source imports, browser/server adapter leaks
  and new environment reads outside composition roots.
- Surfaces receive dependencies; runtimes choose MongoDB, filesystem, network
  and listener adapters.
- `cms-content` owns mutable Pages, Blocs, settings and themes.
- `cms-files` owns namespaces, credentials, uploads, file metadata, byte storage,
  signed access and image representations for the official Files provider.
  `cms-repository` owns immutable contracts, providers and collections.
  `cms-gateway` owns live provider invocation and identities; Files providers
  own file and image semantics.
- The official CMS provider behavior is a normal `cms-core` surface. The future
  `ulvia.provider.cms-instances` control plane remains a separate provider
  product concern.

### Contracts, Providers And Gateway

- Authored contracts use recursive `capabilities/`, `mocks/` and
  `conformance/` trees. The compiler rejects duplicate IDs, dangling mocks,
  invalid conformance ownership and the retired monolithic source format.
- Immutable digests are based on canonical resources rather than source paths.
- Provider manifests approve exact contract releases and requirements. Runtime
  observations cannot silently grant new dependencies.
- CMS Core seals its handler matrix at startup: every admitted official
  capability has exactly one implementation and unexpected handlers fail
  composition.
- Execution plans pin the consumer, provider installation, contract release,
  capability and authority context.
- Gateway calls enforce exact grants, current provider state, bounded transport,
  request/response schemas and provider-owned identity aliases.

### Collections And Content

- Collections can recursively author Blocs, translations, texts, theme tokens,
  assets, Control or Delivery Pages, migrations and selective dependency
  imports.
- Namespace and reference validation covers Blocs, tokens, texts, assets,
  Pages, CSS variables and imported resources.
- Wildcard exports are expanded to exact IDs during compilation; dependency
  imports remain exact.
- Internal Blocs used transitively by public Blocs are delivered without being
  exposed in the author catalogue.
- Collection migration plans use adjacent versions, maintenance mode, revision
  checks, write fencing, batches, cursors, durable progress and restart-safe
  recovery.
- Page revisions provide optimistic concurrency. They are deliberately not a
  user-facing history model.

### Files, Assets And Media

- Author-file mutations use immutable blob pointers, a durable recovery journal
  and a cross-runtime metadata-tree lease.
- Collection assets are recursively discovered, size-limited, content-inspected
  and served with explicit MIME handling, `nosniff`, conditional requests and
  HTTP byte ranges.
- Generic binary inspection, blob storage and image transforms live in
  Foundation and are reused by content and gateway features.
- Public collection assets are exact immutable release resources rather than
  mutable filesystem paths.

### Authentication And Security Controls

- Sessions use bounded signed cookies and the HTTP layer applies same-origin
  checks to protected mutations.
- One-time recovery and authentication tokens use operation-bound reservation
  and finalization in memory and MongoDB.
- Secrets use references and envelope encryption; historical KEKs are required
  while referenced DEKs remain stored.
- Provider HTTP transport resolves and validates network targets, applies DNS/IP
  policy, connects to the selected address while preserving the TLS host,
  disables redirects and bounds time and response size.
- Repository mutations use timestamped, nonce-bound HMAC signatures, durable
  replay rejection, serialized publication, staging tombstones and
  artifact-last visibility.
- Public JSON, form, multipart and import bodies are bounded before parsing.
- HTML and SVG paths have explicit sanitization and image transforms enforce
  input bounds.

A focused Codex Security review covered authentication, gateway networking,
repository publication, files/media, collection rendering, migrations and
runtime deployment. It produced no reportable finding. The review was
surface-complete rather than a line-by-line proof and does not replace external
penetration testing, dependency monitoring or deployment review.

### Control And Delivery

- The legacy static Control application, Dashboard model, collection View model
  and Foundation visual component package are removed.
- Control and Delivery use the same Page/Bloc/resource model and the same
  `/.cms/call` capability transport.
- Control Pages are collection resources, while login, sessions, bootstrap,
  recovery, file streaming and health remain kernel transport concerns.
- The official Control collection provides Pages for overview, content details,
  collections, files, providers, access and settings.

## Current Weaknesses

### Compatibility

1. Collection browser code currently binds to the mutable
   `window.cmsRuntime` object. There is no explicit ABI version negotiation or
   compatibility fixture matrix.
2. Internal MongoDB document schemas do not share one feature-owned migration
   registry. Collection data migrations do not solve internal application
   schema evolution.
3. Pages have a concurrency revision but no retained author history, rollback
   or compatibility pruning across historical Page versions.

### Operations

1. Durable jobs exist, but cross-domain audit events, metrics, trace coverage
   and operator diagnostics are not yet systematic.
2. Full production backup/restore, historical KEK recovery, interrupted
   repository publication and corrupt-state recovery need black-box drills.
3. The supported topology is one active CMS runtime and one active official
   repository writer. Complete multi-replica fencing and split-brain behavior
   are not proven.
4. Proxy headers, external TLS termination, shutdown under load and deployment
   rollback need environment-level tests, not only package tests.

### Scale

1. Some planning and reference discovery still scan all Pages. Cursor-based
   migration execution is implemented, but a materialized resource-reference
   index would be preferable for hundreds of thousands of Pages.
2. Release admission and transfer can hydrate substantial metadata and assets in
   memory. Large remote releases need resumable bounded-parallel transfer and
   more streaming paths.
3. Site installation state is concentrated in MongoDB documents and remains
   subject to BSON document limits as the number of installed resources grows.
4. Image work remains in process. A durable worker queue becomes appropriate
   once transform traffic or latency requires independent scaling.

### Product Completeness

1. The new Control UI covers the official management areas, including per-page
   route/SEO mutation and an operational diagnostics Page. Several deeper
   administration journeys still need dedicated product flows.
2. There is no active visual Page editor. The shared Page/Bloc authoring model
   is ready for one, but the editor itself is intentionally deferred.
3. Conformance suites can run against injected disposable environments and
   immutable output-free evidence can be published and read remotely. Production
   environment provisioning, approval policy and operator-visible evidence
   history remain incomplete; suites are embedded in evidence rather than
   catalogued independently.
4. Generic CMS-instance creation, backup, restore and Core upgrades belong to a
   future provider such as the official local provider or Ulvia Cloud. They are
   not CMS Core data-plane capabilities.
5. Package licensing metadata is not yet fully reconciled between the workspace
   and direct products.

### Trust Boundaries

1. Collection JavaScript is trusted because only reviewed official collections
   are admitted. Shadow DOM and namespaces are encapsulation, not isolation.
2. OIDC code exists but is not part of the current official local bootstrap.
   Discovery, token and JWKS networking must receive Gateway-equivalent SSRF,
   timeout, redirect and size protections before production activation.
3. Author files are publicly readable by ID/path once exposed by the site,
   including unused or draft-only files. They are not a confidential-file
   facility.

The deferred designs and activation gates are recorded in
[`TODO.md`](./TODO.md).

## Enforced Resource Limits

Collection admission currently enforces, among other constraints:

| Resource | Limit |
| --- | ---: |
| Canonical collection document | 8 MiB |
| JSON nesting depth | 64 |
| Blocs | 512 |
| Assets | 1,024 |
| Text definitions | 4,096 |
| Pages | 256 |
| Dependencies | 128 |
| Theme categories | 64 |
| Theme tokens | 4,096 |
| Migrations | 512 |
| Operations per migration | 512 |
| One collection asset | 10 MiB |
| Total collection asset bytes | 50 MiB |
| Bloc markup | 64 KiB |
| Slots per Bloc | 32 |
| Settings per Bloc | 256 |

Author files use a separate 100 MiB per-file limit. These are protocol and
resource-protection choices, not statements of database capacity. Raising one
requires memory, transfer, admission-time and delivery testing rather than only
changing a constant.

## Code And Documentation Hygiene

- The retired EditorJS/editor-v2, Dashboard, View, static Control and visual
  Foundation component implementations are absent from active code.
- Contract source compatibility now has one recursive format instead of a
  legacy inline alternative.
- Remaining byte-identical authored fragments are intentionally independent
  declarative resources. Sharing them would hide contract/resource ownership
  and make release review harder.
- Small export facade files are deliberate public package boundaries, not dead
  indirection.
- File-size and directory-fanout diagnostics are advisory unless they report a
  blocking error. Cohesive schemas and declarative releases may reasonably be
  larger than ordinary source modules.

## Recommended Order Of Work

1. **Version the browser ABI.** Define the host/collection compatibility
   handshake before collection and CMS upgrades can move independently.
2. **Introduce internal persistence migrations.** Give every durable feature an
   ordered, idempotent, fenced and restart-safe schema evolution path.
3. **Complete operational proof.** Add backup/restore, KEK recovery, publication
   interruption, proxy/TLS, shutdown and fault-injection journeys with durable
   audit events and useful metrics.
4. **Materialize resource references and stream release work.** Remove remaining
   all-Page scans and make large transfers restartable before volume forces an
   emergency redesign.
5. **Finish Control product flows, then build the shared Page editor.** Keep both
   Control and Delivery on the one Page/Bloc model.
6. **Operationalize live provider conformance.** Compose disposable provider
   environments, surface evidence history to operators and require current
   passing evidence where approval policy demands it.
7. **Harden deferred trust boundaries before enabling them.** In particular,
   isolate unreviewed collection JavaScript and harden OIDC networking before
   those features are exposed.

## Deliberate Non-Goals For Now

- community or multi-publisher collection publication;
- arbitrary third-party JavaScript in the main document;
- active-active CMS or repository deployment;
- a second Dashboard/View/Application page model;
- a CMS-owned registry of provider-internal instances;
- compatibility with removed pre-1.0 authored source formats.

## Conclusion

The repository's strongest property is now conceptual unity: Pages and Blocs
are the UI model, collections are immutable distributable resources, contracts
describe capabilities, providers implement exact releases, and the Gateway is
the execution boundary. The next work should protect that unity across upgrades
and operations rather than introduce new parallel abstractions.
