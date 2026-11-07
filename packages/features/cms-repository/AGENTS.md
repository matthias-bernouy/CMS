# @bernouy/cms-repository

Feature package for immutable CMS contracts, provider manifests and authored collection bundles, plus pure
models and validation for CMS-owned installations and site selections.

## Layout and boundaries

- Platform contract definitions, admission, bindings and compatibility live in
  `@bernouy/ulvia-contracts`; Provider models and generic validation live in
  `@bernouy/ulvia-providers`. Use their declared exports, never their source trees.
- `src/contracts/` retains catalogue publication, mutation interfaces and memory/Mongo
  persistence. Its `ReleaseCatalogue` extends the Platform read-only port.
- `src/providers/` retains persistent catalogues/stores, connection and approval
  workflows, discovery clients, selection replacement and reviewed upgrades.
- `src/collections/` owns authored collection admission, resource validation,
  content projections, installation and the explicit build toolchain.
- `src/repository/` owns namespace authority, staged publication, filesystem storage,
  source retention, discovery and bounded authoring preparations.
- `src/site-upgrades/` owns durable intents and write fencing for reviewed switches.
- `src/repository-http/` is bounded transport shared by discovery clients.
- Runtime composition chooses adapters and configuration. No business Provider
  invocation or environment reads belong in this package.
- Treat all inputs as untrusted; retain strict parsing, byte/depth/count limits,
  immutable snapshots, ownership fences and artifact-last publication visibility.
- The package root is type-only. Executable APIs use declared explicit subpaths.

## Contract rules

- New capabilities declare `bindings[]` with unique IDs and explicit `http` or
  `mcp` variants. MCP exposure is opt-in; HTTP aliases compile independently.
  The fresh v1 format rejects single `binding` declarations. Never infer MCP
  exposure from HTTP-only bindings.
- A contract release owns the only SemVer; capability IDs are stable and have
  no independent versions. Releases are provider-neutral: HTTP bindings are
  allowed, provider endpoints, credentials and installation state are not.
- A specialization extends one exact parent release. It declares only new
  capabilities; inherited capabilities resolve from the pinned parent chain and
  cannot be redeclared. Keep authored contract directories flat; derive lineage
  depth from exact parent pins rather than directory names. Providers and sites
  claim or select only the concrete contract, never the concrete contract and an
  ancestor together.
- `ResolvedContract` is the execution view of one admitted release. Preserve its
  original release/digest and the declaring owner of every effective capability;
  never flatten inherited capabilities into a `ContractRelease`.
- Capabilities declare mandatory `behavior.sensitive` booleans alongside effect,
  execution and command idempotency. Contracts reject `requires`; implementation
  dependencies belong to Provider manifests. Sensitivity changes participate in
  compatibility comparison and reviewed delegation expansion.
- Object schemas are closed; dynamic string-keyed objects use `map`. String and
  map-key lengths use UTF-16 code units. The format profile follows
  the `@bernouy/ulvia-contracts` format validators, not a full JSON Schema dialect. Reject
  known impossible format-length and map-key/count combinations without claiming
  a general proof that every schema has a value.
- Compatibility is directional: old inputs remain valid for the new release;
  new outputs projected through the old schema remain valid for old consumers.
  Additive output fields can be minor; preserve old required fields and bounds
  recursively. Never truncate values or coerce types to manufacture compatibility.
  Unknown capability compatibility requires a new capability identity; documentation-only or semantically
  equivalent changes may be patches. Compare effective object cardinalities and
  presence, including required fields and fields forced present by a closed
  object's minimum count; equivalent constraints must not force a bump.
- Compatibility reports separate valid publication evolution from consumer
  compatibility. Neither proves that a running provider supports old HTTP bindings.
  Catalogue publication retains SemVer checks within a major and enforces stable
  capability identities across majors against the preceding known stable release.
  Inputs and outputs cannot lose named fields, even optional ones; existing HTTP
  bindings remain executable. Breaking changes require a new capability ID.
  Removal requires a major and a previous stable release deprecating the capability
  with a replacement retained in the target, or explicit `retirement: true` and a
  reason for withdrawal without a successor. Retired IDs cannot be recycled.
  Backports must preserve identities already stable in higher known releases.
  New preview identities may evolve before stabilization; previews cannot bypass
  an existing stable identity. Exact republishes and restoration of verified
  already-stored history do not re-publish historical bytes under a new policy.
  Single-release admission alone cannot prove missing publication history.
- A site's selected release remains authoritative for input and output bounds.
  A newer provider build neither widens it nor proves runtime support for earlier
  release digests. Installation and gateway enforcement are outside contracts.
- Binary media types form an explicit per-release set, not a global allowlist.
  Syntax validation does not prove that bytes match their declared format.
- Binding compilation accounts for every top-level input property exactly once
  and reserves security, identity, tracing and transport headers for the gateway.
- HTTP path and query scalars use `json-percent`: canonical I-JSON scalar text,
  then `encodeURIComponent`; decode once and validate. Every application-header
  mapping declares either that same `uri-component` encoding or `http-field`
  for a non-nullable string following ordinary HTTP field syntax.
  Omission, null and quoted strings differ. Queries use bodyless `GET` or
  JSON-bodied `QUERY`; commands use `POST`, `PUT`, `PATCH` or `DELETE`.
  `HEAD` is derived only from binary `GET`. HEAD errors encode their code and
  request ID in reserved `x-ulvia-error-code` and `x-ulvia-request-id`
  response headers, never a body. See the
  [HTTP profile](../../platform/contracts/fixtures/protocol-v1/http-parameters.md).
- Capability mocks are validated examples, not executable provider responses.
  Binary mock leaves reference declared fixture assets by ID. Bundle admission
  verifies immutable bytes against declared size and SHA-256 before publication;
  mutable URLs and inline base64 cannot substitute for those bytes.

## Provider manifests

- Manifests are immutable provider claims referencing exact admitted contract
  releases and declaring provider-to-gateway requirements. These requirements
  are authority: validate them at publication and never expand them from reports.
- Credential slots are declarations, never credential values or installation
  secret references. Endpoint policies contain allowed origins, not a selected
  installation endpoint.
- Public links help administrators obtain credentials and documentation; they
  do not authorize an endpoint. Data residency is an optional provider-wide
  claim, not a local/remote deployment marker. Installation state owns the
  selected endpoint and the connected account's observed properties.
- Build ranges accept at least one possible SemVer, including explicitly admitted
  prereleases; no published or running build is required for admission.
- Resolve every implemented contract by exact version and digest through a
  `ReleaseCatalogue`. Resolve every capability requirement against at least one
  non-yanked compatible contract release.
- Use the contracts facade's range engine for matching, canonical normalization
  and inclusion. Global and implementation requirements are Provider-owned;
  contracts do not declare or constrain an implementation dependency strategy.
  Delegation policies are independent and never create installation dependencies.
- Reject duplicate implementations, duplicate requirements and cycles between
  matching implemented releases in one manifest. Graph edges respect version
  ranges and capability existence.
- A manifest may claim multiple exact releases of one contract, keyed by
  `(contractId, version)`, each verified by digest. Canonical ordering is ordinal,
  independent of locale. Admission validates claims, not running implementations.
  Never infer old-release support from a newer build or contract SemVer alone.
- Manifest publication revalidates artifact integrity and new publication references.
  Exact republishing is idempotent, including historical references later yanked.
  Reject content replacement and publisher changes across every manifest version.
  A manifest yank is reversible catalogue metadata, never artifact deletion.
- Manifest comparison is descriptive, not a SemVer or runtime behavior guarantee.
  Every changed digest requires explicit approval. Preserve configured limits
  during comparison, publication and installation verification.

## Installations and selections

- V1 connection authentication is a dedicated Bearer token. Persist only an
  exact `${SECRET_KEY}` reference; manifest credential slots are not additional
  implemented connection mechanisms. Provider-hub business credentials stay there.
- Provider-to-CMS gateway credentials are separate from CMS-to-provider tokens.
  A gateway registration request is a sensitive, ephemeral wire DTO: never
  persist it, log it or return it in an admin response.
- An installation is an explicitly approved manifest version and digest for one
  site, endpoint, provider and remote account. Multiple sites may share a remote
  business account through independent installations.
- `enabled`, `disabled` and `revoked` express administrative intent, not readiness.
  Preparation and modification require an explicit host-authorized approval.
  Preparations are ephemeral, bounded-age, single-use local objects, not persisted
  drafts or authentication. Parsing a record does not authorize creation.
- Installation mutations are site-scoped and revision-checked, including observations.
  Provider/account/site/installation identity is immutable. Revocation is terminal;
  configuration, endpoint, token-reference or manifest modifications clear old
  observations and preserve administrative status. Keep all secret values outside stores.
- Runtime reports are observations, never authority. Validate identity, exact
  manifest pin, build range, origin and every reported exact release against a
  trusted admitted manifest. Reconnection supplies the expected account ID;
  missing implementations imply no availability claim.
- Reports cannot expand manifest requirements, establish gateway grants or
  change site selections. Observation timestamps belong to the CMS.
- URL parsing validates syntax only. Require HTTPS except literal loopback HTTP
  development origins. Future transport adapters enforce network policy, timeouts,
  bounded reads and credential-safe redirect handling.
- Select one exact release and installation per `(siteId, contractId)`. Enforcing
  this across the full proposed graph includes all contract capabilities and
  implementation requirements. Missing optional requirements are allowed; selected
  optional targets must match. Reject cycles and report dependency paths.
- Planning never chooses versions, switches installations or implies runtime readiness.
  A full replacement requires non-yanked contract/manifest pins, including retained
  pins; historical graphs remain readable. Stores revalidate selections, not supplied
  plans, and require an unchanged coherent dependency revision before committing.
  Production composition must supply snapshot consistency; this is not a distributed
  transaction. Manifest approval and site selection remain separate operations.
  A provider deployment never implicitly upgrades a site selection.

## Collection authored bundles

- Keep retained Blocs and compositions distinct through explicit `kind` values.
  Every Bloc has one fixed `markup.html`; retained components keep their native
  host and may have scoped styles and optional behavior, while compositions
  replace their authoring host. Compositions cannot have settings, styles or
  behavior modules.
- Reject inline style attributes in all authored markup. Structural classes are
  valid only in component markup, while binding expressions live in Light DOM.
  CSS is parsed and wrapped in a Bloc-owned `@scope`; Shadow DOM selectors and
  APIs are forbidden. Compiled behavior declares the exact browser ABI and is
  rechecked for syntax and forbidden APIs during admission. It remains
  executable source trust, not proof that admission has audited every semantic
  effect.
- Configuration/defaults use bounded, nonnullable object schemas with only
  JSON-representable leaves. Keep page-owned initial content separate from a
  bloc's fixed light-DOM assembly.
- Component settings form an ordered item list. Each item owns a safe lowercase
  HTML attribute ID, label, optional group, scalar string, boolean, finite-number
  or safe-integer type, constraints and default. Its declarative control owns
  authoring hints and finite options;
  keep these hints in the collection JSON rather than compiled editor code. The
  parser derives the validation schema from those items;
  collection-level configuration keeps its broader JSON schema. Local sources
  may use a separate `settings/definition.json`; releases keep the item list.
  Optional `visibleWhen` is editor-only and may reference declared boolean or
  finite-option string items. Validate comparisons and reject visibility cycles;
  hiding a control never clears or exempts its stored attribute.
- Every Bloc declares a nonempty unique `root.accepts` list for the native
  element carrying `cms-bloc`. A retained Bloc that owns one Page-authored
  native child declares a bounded default slot with `kind: "native-element"`;
  there is no separate Bloc `content` contract. Root settings and child native
  attributes remain separate contracts.
- Every Bloc declares its author-facing label, translated description and
  nonempty unique `categories`. Optional nonnegative order values are stable within each category;
  source paths never become catalogue metadata. Slot acceptance is declarative:
  exact Bloc IDs, any retained Bloc, plain text, or the closed inline/prose
  native-content profiles. Rich text remains page-owned HTML and
  never becomes a setting attribute or collection-owned editor document. Verify all local
  uses, exact component accepts, slots and example references and reject cycles.
  Structural markup validation must use a parser. It is not a renderer,
  sanitizer, binding/CSS compiler or permission proof; never treat an admitted
  authored bundle as trusted executable content.
- Verify normalized path asset IDs, exact byte sets, per-asset and aggregate
  sizes, digests and declared profiles. The `inline-svg` profile is granted
  only after parsing the bounded presentation-only geometry vocabulary.
  Snapshot every supplied buffer before any asynchronous work. Returned bytes
  are immutable Blobs; do not retain mutable caller-owned buffers.
- Requirements belong to resources. Require one non-yanked contract witness
  jointly satisfying a resource and its transitive uses; do not conflate this
  with selecting providers or validating the whole site's installation graph.
- `./collections/installations` owns immutable releases and revisioned per-site
  installation/text overrides; `/collections/mongo` is a runtime-only adapter.
  The installer accepts complete admitted bundles, persists verified assets and
  resolves resource capability requirements through its configured contract
  catalogue. Compatible upgrades preserve site overrides and stored setting
  value schemas, may only widen existing slot/native-element contracts, and
  preserve theme-token types. Validate the candidate installation before the
  revisioned write; remote registry transfer is separate from site installation.
- Collection resources retain compatible contracts under stable IDs. Incompatible
  retained resources need new identities, including in major releases. Deprecation
  metadata is advisory and may identify an existing replacement of the same kind;
  reject replacement cycles. Resource digests describe impact without generations
  or transformation chains. Collection configuration may receive explicit target
  values validated against the target release during a reviewed upgrade.
- Release changes require a current applicable plan. Missing authoritative usage
  or changing revisions make the analysis incomplete; incomplete plans cannot
  authorize a switch. Keep catalogue examples separate from runtime consumers
  when deriving execution grants. Applying an upgrade never rewrites Pages.
- Collection and contract switches share the site write fence and durable exact
  intents. Normal mutations of analysed state must use that fence. Recheck plans
  under maintenance and resolve uncertain commits before releasing ownership;
  never let a stale worker release a successor's lease.
- Features persisting references to collection resources must supply an
  authoritative `UsageContributor` and register its ID as a required consumer.
  Missing or failing contributors make the inventory incomplete.
- Every text definition declares `category`, `group` and `label` as collection
  translation keys; `description` remains optional. Admission verifies every
  declared key against the default translation catalogue, so an incomplete text
  catalogue cannot become a release. This metadata is declarative and bounded,
  does not change server text keys and does not grant runtime capabilities.
  Text locale values are static strings: parameters, plural forms and braces are
  not part of the collection contract.
- Resource IDs are full `namespace/name` identities; every publisher field must
  match that namespace. Collection names are nonreserved lowercase kebab-case.
  Derive HTML/CSS ownership through `resourceRuntimeNamespace`, then append `--`
  and the local Bloc, token or state ID. Never use the canonical slash identity
  directly as a CSS prefix or infer ownership by a loose string prefix.
- Stable and beta discovery derive from canonical SemVer, not mutable metadata.
  Every prerelease belongs to the beta filter. Search and installation discovery
  default to stable; historical catalogue listing defaults to all releases.
  Exact installations, approvals and selections remain pinned and explicit.
- Collection theme categories, entries and Pages are admitted
  and included in the release digest. Cross-collection dependencies import only explicitly
  exported Bloc tags, collection-local theme token IDs, server text IDs and immutable
  asset IDs from one publisher and bounded version range. Imported IDs retain
  compatible contracts across that range. Installation resolves the complete graph, rejects
  cycles, and revalidates dependents during upgrades. Reject unsupported fields until validated.
- Theme defaults may reference local or selectively imported tokens. Reject
  dangling references and local cycles; exact token aliases must preserve types,
  including across the installed dependency graph.
- Theme entries are either ordinary translated tokens or typed `font-face`
  entries backed by a local WOFF2 asset. Font faces are projected to
  collection-prefixed CSS family names; they are not theme-token imports or
  independently generated resources.
- Collection asset expressions keep the owner namespace
  (`cms.asset.<collection>.<relative/path>`).
- Authored SVG elements are empty `svg[cms-svg]` references. Raw inline SVG is
  forbidden. Collection-authored references must resolve to a local or
  explicitly imported asset carrying the verified `inline-svg` profile.
- Collection asset admission verifies declared size, digest, and recognizable media signatures. Installed asset
  metadata can be resolved in batches without hydrating unrelated releases or binary payloads.
  Export controls dependency authority, while the Edge may serve any installed immutable
  asset needed by its owning collection. Public URLs include the verified content digest.
- Collection, Bloc, setting, text, theme and Page administration
  metadata always stores translation keys, never inline display copy. The
  immutable collection translation catalogue is keyed first by canonical BCP
  47 locale, then by reusable collection-local key. Require every reference in
  the collection's default locale and allow partial additional locales to fall
  back through regional parents to that default. These translations are not
  site-overridable content texts.

- `./collections/build` also owns recursive authored source assembly shared by
  CLI and instance preparation. Keep compiler imports behind this explicit API.
- `./repository/authoring` owns bounded collection, contract and Provider manifest
  preparations and exact publication. `./repository/authoring/build` exposes the
  shared authored contract/docs compiler; the CLI must not own another compiler.
  `./repository/sources` owns private immutable owner-authorized source snapshots
  for all three kinds. Preparation dependency evidence is bounded and request-local;
  it never imports releases into host catalogues, installs resources or deploys code.
  Neither authoring nor source retention grants implicit installation or exposes private keys.

- Collection v1 owns explicit `examples` documents and fixed preview frames.
  Require translated Bloc descriptions and nonempty unique `categories`.
  Listed Blocs choose a single matching-root `defaultExample`; multi-root
  examples remain demonstrations. Examples reuse ordinary collection texts;
  insertion preserves those references. Locale and theme mode belong to rendering
  options, never authored examples or preview frames. Preview rendering stays behind `/collections/build`;
  browser execution belongs to the CLI and never the Edge or admission.

- Optional collection `bootstraps` are exact-release initialization data, authored
  in `bootstrap.json`. They never reserve routes, grant invocation authority or
  run during ordinary installation/upgrade. Admission validates local example and
  translation references, ordinary Page paths, aggregate recipe limits and joint
  capability witnesses for each recipe's local Pages. External includes pin a
  publisher, collection, version, digest and recipe ID; their resolution and
  combined Page conflicts belong to an explicit initialization plan. Changes to
  recipe data require a minor release. Keep parsers and authoring support distinct
  from the not-yet-mounted execution workflow.

- Contract documentation has a generated bounded manifest and separate verified
  `docs/<path>` assets. Mongo stores document text separately from release
  metadata; fixture-byte storage remains unsupported by that adapter. Metadata
  admission does not authorize publication without complete verified docs.
