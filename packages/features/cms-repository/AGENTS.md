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
- Filesystem/remote catalogue adapters and registry distribution are future
  repository capabilities; optional adapters need explicit subpaths. Business
  HTTP execution and gateway routing remain outside this package; runtimes own
  environment access and production adapter selection. `./providers/mongo`
  provides durable manifest, installation and selection stores; `./contracts/mongo`
  provides durable release publication. Live transport and conformance execution
  remain outside this package. Mongo release publication currently rejects
  bundles with fixture assets until separate byte storage is implemented.
- `src/collections/{interfaces,core}/` owns authored collection release parsing,
  asset verification and resource-level reference validation, exposed through
  `./collections`. `./collections/texts` exposes browser-safe text validation,
  locale resolution and formatting. Translation catalogues are declarative JSON;
  immutable release texts and mutable site overrides remain separate.
  Collections consume the contracts facade, not providers or
  contracts internals. Do not merge immutable releases with per-site state.
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

- A contract release owns the only SemVer; capability IDs are stable and have
  no independent versions. Releases are provider-neutral: HTTP bindings are
  allowed, provider endpoints, credentials and installation state are not.
- A capability may require external capabilities by contract ID, capability ID
  and compatible SemVer range. Requirements are mandatory and provider-neutral.
  `versionRange` defines accepted versions, not evidence partitions. Optional
  `supportRanges` has one to four nonempty subsets covering the accepted set,
  defaulting to `[versionRange]`. Each needs a published witness jointly
  satisfying one capability's requirements to the same contract, including
  historical yanked releases. Installability is a later selection decision,
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
  compatibility. Neither proves provider conformance or old HTTP binding support.
  Catalogue publication compares with the latest stable release of the same
  major and checks monotonic order within a prerelease target. Preview shapes
  may change before stabilization without breaking an existing stable major line.
- A site's selected release remains authoritative for input and output bounds.
  A newer provider build neither widens it nor proves conformance with earlier
  release digests. Installation and gateway enforcement are outside contracts.
- Binary media types form an explicit per-release set, not a global allowlist.
  Syntax validation does not prove that bytes match their declared format.
- Binding compilation accounts for every top-level input property exactly once
  and reserves security, identity, tracing and transport headers for the gateway.
- HTTP path/query/application-header scalars use `json-percent`: canonical
  I-JSON scalar text, then `encodeURIComponent`; decode once and validate.
  Omission, null and quoted strings differ. GET/HEAD must be queries. HEAD errors
  encode their code and request ID in reserved `x-ulvia-error-code` and
  `x-ulvia-request-id` response headers, never a body. See the
  [HTTP profile](fixtures/contracts/protocol-v1/http-parameters.md).
- Capability mocks are validated examples, not executable provider responses.
  Binary mock leaves reference declared fixture assets by ID. Bundle admission
  verifies immutable bytes against declared size and SHA-256 before publication;
  mutable URLs and inline base64 cannot substitute for those bytes.
- Conformance suites are independently versioned, provider-neutral artifacts
  pinned to an admitted release's exact digest. Validate scenarios, assets,
  actors, captures, assertions and reasoned coverage exemptions before hashing;
  they do not change the release digest. Neither suites nor coverage reports
  attest that a provider passed. HTTP execution, disposable-tenant provisioning
  and cleanup remain outside the contracts domain.
- Suites exercising required capabilities declare bounded dependency profiles
  with exact contract/version/digest pins. Verify supplied artifacts and each
  profile's transitive graph from applicable scenario calls. Optional scenario
  `profiles` selects known IDs; omission applies to all, and each profile needs
  an applicable scenario. Cover each exercised root requirement's support range
  in a profile actually calling that root. Do not imply all versions or Cartesian
  combinations were tested; external setup/verification calls are not root coverage.
- Conformance templates recursively escape markers with `{ $literal: value }`.
  Captures need guaranteed paths or an exact successful presence/equality
  assertion. JSON Pointers traverse objects, arrays and maps; V1 rejects
  overlapping ancestor/descendant assertions.
- Replay keys, operation completion, eventual queries and pagination are bounded
  declarations, not an executor. Preserve the restrictions in
  [conformance controls](fixtures/contracts/protocol-v1/conformance-controls.md).
  Aggregate/per-profile coverage is descriptive; fresh disposable isolation
  applies to every applicable scenario/profile pair, even on failure.

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
  independent of locale. Admission validates claims, not running implementations;
  each served release still needs release-specific conformance evidence. Never
  infer old-release support from a newer build or contract SemVer alone.
- Manifest publication revalidates artifact integrity and new publication references.
  Exact republishing is idempotent, including historical references later yanked.
  Reject content replacement and publisher changes across every manifest version.
  A manifest yank is reversible catalogue metadata, never artifact deletion.
- Manifest comparison is descriptive, not a SemVer or conformance guarantee.
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

- Keep components and compositions distinct: components have static shadow
  shells and optional light DOM; composition-only blocs expand into Light DOM
  without retaining their authoring host. They cannot have settings, styles,
  behaviour modules or `cms-host`. Bindings never belong in the shadow shell.
- Reject inline style attributes in all authored markup. `class` is valid only
  in Shadow DOM, and binding expressions only in Light DOM. Compiled component
  runtime bundles are hashed with the release and remain executable source
  trust, not proof that admission has audited behavior.
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
- Managed native components declare a nonempty unique `nativeElement.accepts`
  list. They have exactly one unnamed Shadow DOM slot, no named page slots or
  fixed Light DOM, and one direct accepted native root in default content. The
  real child tag is authoritative; wrapper settings never duplicate it.
- Every bloc declares its author-facing label. Optional catalogue categories are
  translation keys and optional nonnegative order values are stable within that
  category; source paths never become catalogue metadata. Slot acceptance is declarative:
  exact component tags, any component, bounded media kinds, plain text, or the
  closed inline/prose rich-text profiles. Rich text remains page-owned HTML and
  never becomes a setting attribute or collection-owned editor document. Verify all local
  uses, exact component accepts, slots and thumbnail references and reject cycles.
  Structural markup validation must use a parser. It is not a renderer,
  sanitizer, binding/CSS compiler or permission proof; never treat an admitted
  authored bundle as trusted executable content.
- Verify asset IDs, exact byte sets, per-asset and aggregate sizes, and digests.
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
  revisioned write; publication to a remote registry remains unsupported.
- Collection releases carry cumulative adjacent data-generation migrations and
  per-resource generations. Migration operations are closed, declarative data;
  never accept executable migration code. Contract and implementation digests
  are derived after admission and do not replace the collection SemVer or
  immutable release digest.
- Text metadata (`category`, `group`, `label`, `description`) uses collection
  translation keys. It is declarative and bounded, does not change server text
  keys and does not grant runtime capabilities.
  Text locale values are static strings: parameters, plural forms and braces are
  not part of the collection contract.
- Treat `collectionId` as the runtime namespace. It is lowercase kebab-case,
  excludes platform-owned roots, prefixes every custom-element tag and derives
  global theme token IDs and CSS variables. Validate derived identities during
  collection admission rather than waiting for installation or compilation.
- Collection theme categories and tokens, HTML views, and dashboard templates
  are admitted and included in the release digest. Dashboard templates reference
  only local declared views; site activation and membership live outside the
  immutable release. Cross-collection dependencies import only explicitly
  exported Bloc tags, collection-local theme token IDs, server text IDs and immutable
  asset IDs from one publisher and bounded version range. Installation resolves the complete graph, rejects
  cycles, and revalidates dependents during upgrades. Remote publication remains
  a future slice. Reject unsupported fields until validated.
- Theme defaults may reference local or selectively imported tokens. Reject
  dangling references and local cycles; exact token aliases must preserve types,
  including across the installed dependency graph.
- Collection asset expressions keep the owner namespace (`cms.asset.<collection>.<asset>`).
  Export controls dependency authority, while Delivery may serve any installed immutable
  asset needed by its owning collection. Public URLs include the verified content digest.
- Collection, Bloc, setting, text, theme, View and dashboard administration
  metadata always stores translation keys, never inline display copy. The
  immutable collection translation catalogue is keyed first by canonical BCP
  47 locale, then by reusable collection-local key. Require every reference in
  the collection's default locale and allow partial additional locales to fall
  back through regional parents to that default. These translations are not
  site-overridable content texts.
