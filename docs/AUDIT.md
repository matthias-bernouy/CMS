# Repository Audit

This audit describes the CmsCore repository as reviewed on 2026-10-20. It is a
source-backed engineering assessment, not a security certification or a claim
that every production failure mode has been exercised.

## Executive Assessment

CmsCore now has a coherent platform core. The dependency direction is enforced,
immutable contracts and collection releases have strict admission rules, Ulvia
Provider capabilities are sealed at startup, collection migrations are recoverable,
and administration is rendered from collection-owned Pages rather than a second static
application model.

The repository is suitable for continued product development and a controlled
single-node deployment with separate Ulvia Provider and Kernel processes. It
should not yet be described as ready for a
critical, horizontally scaled production service. The remaining risks are
mostly long-lived compatibility, operational recovery, provider conformance and
deployment validation rather than unclear ownership between packages.

## Verified Shape

The workspace contains 20 packages:

- eight Foundation packages, including shared structured logging;
- six feature packages: authentication, content, files, gateway, repository and SEO;
- two HTTP applications: Ulvia Provider and the site Kernel;
- four executable runtimes: Ulvia Provider server, Kernel server, official
  repository server and CLI.

The official repository currently contains:

- eight `ulvia.cms.*` contracts with 77 capabilities;
- one provider-only CMS-instance discovery contract with two capabilities that
  the `ulvia.official` data-plane manifest does not claim;
- the `ulvia.official` provider manifest;
- the `ulvia-official` collection with 92 Blocs, 119 theme tokens and thirteen
  Pages: ten administration routes plus login, email-confirmation and
  password-reset Pages.

The supported package dependency direction is:

```text
runtimes -> surfaces -> features -> foundation
```

`packages/official-repository` is an authored product tree, not a runtime
dependency layer. `@bernouy/official-repository-server` is the independent
runtime that admits and serves its immutable artifacts.

## Validation Evidence

The final review run completed with:

- all ten `check:all` diagnostics passing;
- the complete workspace build passing;
- the complete workspace test suite passing with 2,222 tests, one skipped test
  and no failure, with the explicitly opt-in fresh-install browser smoke kept as
  a separate environment journey;
- that fresh-install browser smoke passing separately against a new local stack,
  including administration mutations, a second isolated instance and restart;
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
- The official CMS provider behavior is the `ulvia-provider` surface. Its
  authenticated operator API owns instance creation and provisioning, while the
  unclaimed `ulvia.provider.cms-instances` contract remains a separate provider
  discovery concern.

### Contracts, Providers And Gateway

- Authored contracts use recursive `capabilities/`, `mocks/` and
  `conformance/` trees. The compiler rejects duplicate IDs, dangling mocks,
  invalid conformance ownership and the retired monolithic source format.
- Immutable digests are based on canonical resources rather than source paths.
- Provider manifests approve exact contract releases and requirements. Runtime
  observations cannot silently grant new dependencies.
- Ulvia Provider seals its handler matrix at startup: every admitted official
  capability has exactly one implementation and unexpected handlers fail
  composition.
- Execution plans pin the consumer, provider installation, contract release,
  capability and authority context.
- Gateway calls enforce exact grants, current provider state, bounded transport,
  request/response schemas and provider-owned identity aliases.

### Collections And Content

- Collections can recursively author Blocs, translations, texts, theme tokens,
  assets, administration or public Pages, migrations and selective dependency
  imports.
- Namespace and reference validation covers Blocs, tokens, texts, assets,
  Pages, CSS variables and imported resources.
- Wildcard exports are expanded to exact IDs during compilation; dependency
  imports remain exact.
- Browser behavior bundles declare the `v1` host ABI. Build, release admission
  and runtime registration all reject incompatible artifacts.
- Hidden Blocs used transitively by listed Blocs are delivered without being
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

- Access owns accounts, credential proof, signed session tokens and account
  lifecycle capabilities. Administrator authority remains a separate revisioned
  grant joined during actor resolution.
- The Kernel owns no authentication store or secret. It applies only a validated
  semantic session effect and fixes the `cms-session` cookie policy to
  `HttpOnly`, `SameSite=Lax`, `Path=/`, bounded expiry and `Secure` on HTTPS.
- Bearer and cookie credentials are reduced to one typed opaque credential for
  `resolve-actor`; arbitrary browser authority headers do not pass through to
  ordinary Provider capabilities.
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

This audit does not replace external penetration testing, dependency monitoring
or deployment review. The explicit browser-mutation provenance gap is recorded
in [`TODO.md`](./TODO.md#browser-mutation-provenance) rather than hidden behind
the cookie policy.

### Unified Kernel

- The legacy static administration application, Dashboard model, collection View model
  and Foundation visual component package are removed.
- Administration and public rendering use the same Page/Bloc/resource model and the same
  `/.cms/call` capability transport.
- Authentication and recovery documents are collection Pages. Access owns their
  capabilities and session-token semantics; Kernel owns only actor resolution
  and validated cookie application.
- File bytes use the same generic capability transport as JSON operations; the
  Files provider owns their streaming, range and cache semantics.
- The official administration collection provides Pages for overview, Page
  catalogue/details, collections/details/migrations, files, providers, access,
  settings and diagnostics.

## Current Weaknesses

### Compatibility

1. Internal MongoDB document schemas do not share one feature-owned migration
   registry. Collection data migrations do not solve internal application
   schema evolution.
2. Pages have a concurrency revision but no retained author history, rollback
   or compatibility pruning across historical Page versions.

### Operations

1. Structured runtime diagnostics, request correlation and local rotating
   journals are systematic. Durable cross-domain audit events, metrics, traces
   and an operator-facing observability backend are not.
2. Full production backup/restore, historical KEK recovery, interrupted
   repository publication and corrupt-state recovery need black-box drills.
3. The supported topology is one active Kernel per instance, one Ulvia Provider
   process and one active official repository writer. Complete multi-replica
   fencing and split-brain behavior are not proven.
4. Proxy headers, external TLS termination, shutdown under load and deployment
   rollback need environment-level tests, not only package tests.
5. Cookie-authenticated commands rely on the current cookie policy; a single
   explicit `Origin`/Fetch Metadata policy is not yet enforced at the generic
   Kernel capability boundary.

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

1. The administration UI covers the official management areas, including
   per-Page route/SEO mutation, file workspace operations and an operational
   diagnostics Page. Several deeper administration journeys still need
   dedicated product flows and further visual/interaction refinement.
2. The visual Page editor supports top-level Bloc insertion, settings, ordering,
   duplication and removal. Nested visual editing, starter templates, history,
   direct media selection and richer authoring feedback remain incomplete.
3. Conformance suites can run against injected disposable environments and
   immutable output-free evidence can be published and read remotely. Production
   environment provisioning, approval policy and operator-visible evidence
   history remain incomplete; suites are embedded in evidence rather than
   catalogued independently.
4. Ulvia Provider now owns operator-authenticated instance creation, durable
   credentials and idempotent installation of the official profile. Backup,
   restore, runtime upgrades and production process orchestration remain
   incomplete and are not `ulvia.cms.*` data-plane capabilities.
5. Package licensing metadata is consistently declared as MIT across the
   workspace; release packaging still needs its own distribution check.

### Trust Boundaries

1. Collection JavaScript is trusted because only reviewed official collections
   are admitted. The versioned ABI and admission policy reject incompatible or
   explicitly forbidden behavior, but scoped Light DOM and namespaces remain
   encapsulation rather than isolation.
2. Author files are publicly readable by ID/path once exposed by the site,
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

- The retired EditorJS/editor-v2, Dashboard, View, static administration app and visual
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

1. **Introduce internal persistence migrations.** Give every durable feature an
   ordered, idempotent, fenced and restart-safe schema evolution path.
2. **Complete operational proof.** Add backup/restore, KEK recovery, publication
   interruption, proxy/TLS, shutdown and fault-injection journeys with durable
   audit events and useful metrics.
3. **Materialize resource references and stream release work.** Remove remaining
   all-Page scans and make large transfers restartable before volume forces an
   emergency redesign.
4. **Finish administration product flows and deepen the shared Page editor.** Keep
   administration and public rendering on the one Page/Bloc model.
5. **Operationalize live provider conformance.** Compose disposable provider
   environments, surface evidence history to operators and require current
   passing evidence where approval policy demands it.
6. **Harden deferred trust boundaries before enabling them.** In particular,
   isolate unreviewed collection JavaScript before that feature is exposed.

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
