# @bernouy/cms-repository

Feature package for immutable CMS contracts, provider manifests and authored collection bundles, plus pure
models and validation for CMS-owned installations and site selections.

## Layout and boundaries

- `src/contracts/interfaces/` contains release, schema, binding and catalogue
  types. `src/contracts/core/` owns parsing, validation, binding compilation,
  admission, compatibility and protocol primitives. Its `catalogue/` directory
  owns storage-independent evolution and requirement checks; catalogue
  implementations delegate them. The in-memory catalogue lives in
  `src/contracts/default-implementation/memory/`; `mongo/` persists immutable
  artifacts and revisioned publication metadata.
- `src/providers/manifests/{interfaces,core}/` owns immutable manifest types,
  parsing, ranges, reference validation, admission, comparison and limits.
  Its catalogue port and memory adapter preserve exact artifact keys and publisher ownership.
  `src/providers/installations/{interfaces,core}/` owns approved installation,
  runtime-report and bootstrap DTOs, pure parsing, consistency checks and
  protocol metadata, plus explicit preparation/approval and administrative transitions.
  `src/providers/selections/` owns full-site explicit graph validation and a
  revisioned store. Installations and selections have deterministic memory adapters.
- `src/exports/` defines the stable facade independently of domain internals.
  The package root is type-only. Executable APIs use explicit `/contracts` and
  `/providers` and `/collections` subpaths, as listed in [README.md](README.md).
- Contracts must not depend on providers or installation state. Providers
  consume contracts through `cms-repository/exports/contracts` and its facade
  subpaths, never directly through `src/contracts/` internals. External callers
  use declared `@bernouy/cms-repository/...` exports.
- `/contracts/schema` exposes the bounded `ulvia-schema/v1` vocabulary;
  `/contracts/bindings` exposes immutable HTTP execution plans and scalar codecs;
  `/contracts/compatibility` exposes release evolution checks;
  `/contracts/catalogue` exposes an adapter-light port and deterministic memory
  implementation; `/contracts/protocol` exposes strict I-JSON parsing,
  canonicalization and freezing primitives.
- HTTP catalogue sources, bounded immutable downloads, the authenticated signed
  publication protocol and its storage-independent mutation endpoint are
  implemented here. `./repository/filesystem` is the reference local adapter;
  runtimes choose it or a durable production adapter. The CLI owns commands,
  environment-derived credentials and its loopback listener. Business
  HTTP execution and gateway routing remain outside this package; runtimes own
  environment access and production adapter selection. `./providers/mongo`
  provides durable manifest, installation and selection stores; `./contracts/mongo`
  provides durable release publication. Live transport execution
  remain outside this package. Mongo release publication currently rejects
  bundles with fixture assets until separate byte storage is implemented.
- Remote publication is staged: sign bounded metadata first, stream each declared
  asset as a separately signed raw body, then commit through the registry exactly
  once. Upload stores must verify byte length and SHA-256 before exposing a Blob,
  retain an idempotent commit receipt, expire abandoned sessions and keep the
  immutable release invisible until registry publication succeeds. Never restore
  the whole-bundle base64 request.
- `./repository/namespaces` owns public first-claim Ed25519 namespace authority.
  Keep private keys in host-owned secret readers. Rotation proves possession of
  both keys; revocation is terminal and operators have no community recovery path.
  Preserve repository/action/subject/content/revision proof binding and hold the
  namespace fence throughout an authorized mutation. `./repository/contract`
  declares the Repository capability service; transport adapters inject its ports.
- `src/collections/{interfaces,core}/` owns authored collection release parsing,
  asset verification and resource-level reference validation, exposed through
  `./collections`. `./collections/texts` exposes browser-safe text validation,
  locale resolution and formatting. Translation catalogues are declarative JSON;
  immutable release texts and mutable site overrides remain separate.
  Collections consume the contracts facade, not providers or
  contracts internals. Do not merge immutable releases with per-site state.
- `./collections/build` is the explicit Bun-based authoring toolchain for
  validating Bloc source and producing immutable browser runtime bundles. Keep
  compiler and filesystem dependencies behind this subpath; the package root and
  normal collection admission must never import the build pipeline.
- `./collections/content` projects admitted and installed collections into the
  generic Page, Bloc, text and theme contribution contracts owned by
  `@bernouy/cms-content`.
- `./collections/assets` resolves installed immutable asset references into
  public representation URLs. HTTP request parsing, ranges and response headers
  remain in `./collections/http`.
- `./collections/installations` exposes read-only usage inventories, reviewed
  collection upgrade plans and exact release switches. `./upgrades` owns shared
  durable site intents and write fencing; its Mongo adapter is exported from
  `./upgrades/mongo`. Intents contain exact pins and prepared values, never Page
  snapshots or transformation journals.
- `src/repository-http/` contains only bounded HTTP transport shared by the
  collection and provider repository sources. It must not import any domain.
  Keep catalogue parsing, references and admission in their respective domains.
- Treat inputs as untrusted. Parse from `unknown` or strict JSON; reject unknown
  fields, duplicate properties, ambiguous mappings/ranges and limit violations.
  Apply byte/depth/count limits to object and JSON entry points; reject sparse
  arrays and invalid UTF-8. Return independent immutable snapshots without
  freezing caller-owned data. Hash canonical I-JSON bytes with SHA-256 only
  after structural and semantic validation, never author formatting or a
  partially validated object.

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
- A capability may require external capabilities by contract ID, capability ID
  and compatible SemVer range. Requirements are mandatory and provider-neutral.
  `versionRange` defines accepted versions and must describe a nonempty set.
  Publication needs a known release jointly satisfying one capability's
  requirements to the same contract, including historical yanked releases.
  Installability is a later selection decision,
  not historical reference validity. Optional product features need an explicit
  capability/profile model, not optional requirements leaving a capability unusable.
- Adding or removing a mandatory requirement on an existing capability, or
  dropping accepted dependency versions, requires a major. Compare accepted
  version sets: equivalent sets are patches, strict expansions are minors, and
  any lost version requires a major. A new capability with its own requirements
  remains a minor addition.
- Object schemas are closed; dynamic string-keyed objects use `map`. String and
  map-key lengths use UTF-16 code units. The format profile follows
  `src/contracts/core/schema/formats.ts`, not a full JSON Schema dialect. Reject
  known impossible format-length and map-key/count combinations without claiming
  a general proof that every schema has a value.
- Compatibility is directional: old inputs remain valid for the new release;
  new outputs projected through the old schema remain valid for old consumers.
  Additive output fields can be minor; preserve old required fields and bounds
  recursively. Never truncate values or coerce types to manufacture compatibility.
  Unknown relationships require a major; documentation-only or semantically
  equivalent changes may be patches. Compare effective object cardinalities and
  presence, including required fields and fields forced present by a closed
  object's minimum count; equivalent constraints must not force a bump.
- Compatibility reports separate valid publication evolution from consumer
  compatibility. Neither proves that a running provider supports old HTTP bindings.
  Catalogue publication compares with the latest stable release of the same
  major and checks monotonic order within a prerelease target. Preview shapes
  may change before stabilization without breaking an existing stable major line.
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
  [HTTP profile](fixtures/contracts/protocol-v1/http-parameters.md).
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
  and inclusion. Each implemented capability's mandatory requirements must be
  covered by non-optional manifest requirements without dropping any accepted
  dependency alternative. Additional implementation-specific requirements are allowed.
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
- Treat `collectionId` as the runtime namespace. It is lowercase kebab-case,
  excludes platform-owned roots, prefixes every Bloc identifier and derives
  global theme token IDs and CSS variables. Validate derived identities during
  collection admission rather than waiting for installation or compilation.
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
  Export controls dependency authority, while the Kernel may serve any installed immutable
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
- `./repository/authoring` owns bounded collection preparations and exact
  publication; `./repository/sources` owns private immutable owner-authorized
  source snapshots. Neither grants implicit installation or exposes private keys.

- Collection v1 owns explicit `examples` documents and fixed preview frames.
  Require translated Bloc descriptions and nonempty unique `categories`.
  Listed Blocs choose a single matching-root `defaultExample`; multi-root
  examples remain demonstrations. Resolve only
  editable demonstration copy for insertion and never persist example fixtures
  as site text overrides. Preview rendering stays behind `/collections/build`;
  browser execution belongs to the CLI and never the Kernel or admission.
