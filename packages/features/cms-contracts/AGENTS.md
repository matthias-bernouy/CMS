# @bernouy/cms-contracts

Feature package for immutable CMS release formats and their admission rules.

## Layout

- `src/interfaces/` contains release, schema, binding, and catalogue types.
- `src/core/` owns parsing, schema validation, binding compilation, admission,
  compatibility, and protocol primitives.
- `src/core/catalogue/` owns storage-independent publication rules for release
  evolution and requirements. Catalogue implementations delegate these checks.
- `src/default-implementation/memory/` owns the in-memory release catalogue.
- `src/exports/` defines the stable package subpaths independently of this
  internal layout.

## Boundaries

- The root export exposes contract release parsing, canonicalization, digests,
  and protocol types.
- `@bernouy/cms-contracts/schema` exposes the bounded `ulvia-schema/v1`
  vocabulary, parsing, and value validation.
- `@bernouy/cms-contracts/bindings` exposes HTTP binding definitions and the
  compiler that produces immutable execution plans, plus pure scalar codecs.
- `@bernouy/cms-contracts/catalogue` exposes the adapter-light catalogue port
  and its deterministic in-memory implementation.
- `@bernouy/cms-contracts/protocol` exposes strict I-JSON parsing,
  canonicalization, and freezing primitives shared by other Protocol v1
  feature packages.
- Filesystem, remote HTTP catalogue, registry, provider installation, and
  runtime execution code do not belong in this package boundary.
- Release input is untrusted data. Parse from `unknown` or strict JSON and
  reject unknown fields, duplicate JSON properties, ambiguous mappings, and
  configured limit violations.

## Rules

- A contract release owns the only SemVer. Capability IDs are stable and do
  not carry independent versions.
- Contract releases are provider-neutral. They may declare HTTP bindings, but
  never provider endpoints, credentials, or installation state.
- A capability may require external capabilities by contract ID, capability ID,
  and compatible SemVer range. Requirements are mandatory and provider-neutral;
  `versionRange` defines accepted versions, not evidence partitions. Optional
  `supportRanges` contains one to four nonempty subsets covering the accepted
  set and defaults to `[versionRange]`. Each support range needs a published
  witness jointly satisfying one capability's requirements to the same
  contract, including historical yanked releases. Installability is a later
  selection decision, not historical reference validity. Optional product features need an
  explicit capability/profile model, not an optional requirement that leaves a
  published capability unusable.
- A new mandatory requirement on an existing capability, removal of one, or a
  dependency range that drops previously accepted versions requires a major.
  Compare ranges by their accepted version sets, not textual branch identity:
  equivalent sets are patches, strict expansions are minors, and any lost
  version requires a major. A new capability with its own requirements remains
  a minor addition.
- Object schemas are closed. Dynamic string-keyed objects use the explicit
  `map` schema kind.
- String and map-key lengths use UTF-16 code units. The format profile follows
  `core/schema/formats.ts`, not an implied full JSON Schema dialect. Reject known
  impossible format-length and map-key/count combinations without claiming a
  general proof that every schema has a value.
- Schema compatibility is directional: old inputs must remain valid for the
  new release, and new outputs projected through the old schema must remain
  valid for old consumers. Additive output fields can be minor; projection must
  preserve old required fields and bounds recursively. Never truncate values
  or coerce types to manufacture compatibility. Unknown relationships require
  a major. Documentation-only or semantically equivalent changes may remain
  patches.
  Compare effective object cardinalities and presence, including bounds implied
  by required fields and fields forced present by a closed object's minimum count.
  Equivalent constraints must not force a minor or major.
- Compatibility reports separate valid publication evolution from consumer
  compatibility. Neither flag proves provider conformance or old HTTP binding
  support. Catalogue publication compares against the latest stable release
  of the same major, while checking monotonic order within a prerelease target.
  Preview-to-preview shapes may change before stabilization; they must not
  break an existing stable major line.
- A site's selected release remains authoritative for its input and output
  bounds. A newer provider build does not widen the selected release or prove
  conformance with earlier release digests; installation and gateway enforcement
  belong outside this package.
- Binary media types form an explicit per-release set, not a global allowlist.
  Syntax validation does not prove that bytes match the declared format.
- Binding compilation must account for every top-level input property exactly
  once and must reserve security, identity, tracing, and transport headers for
  the gateway.
- HTTP path/query/application-header scalars use `json-percent`: canonical
  I-JSON scalar text, then `encodeURIComponent`; decode once and validate.
  Omission, null and quoted strings are distinct. GET/HEAD must be queries.
  HEAD errors carry their code and request ID in the reserved
  `x-ulvia-error-code` and `x-ulvia-request-id` response headers with this codec;
  they never acquire a response body. See `fixtures/protocol-v1/http-parameters.md`.
- Digests use canonical I-JSON bytes and SHA-256. Never hash author formatting
  or a partially validated object.
- Capability mocks are validated examples, not executable provider responses.
  Binary mock leaves reference declared fixture assets by ID. Bundle admission
  verifies the supplied immutable bytes against declared size and SHA-256 before
  a release with assets can be published; no mutable URL or inline base64 is a
  valid substitute.
- Conformance suites are independently versioned, provider-neutral test
  artifacts pinned to the exact digest of an admitted release. Their scenarios,
  assets, actors, captures, assertions, and reasoned coverage exemptions are
  validated before the suite is hashed; they do not change the release digest.
  A suite or coverage report is not a passing-provider attestation. The suite
  requires a disposable tenant; HTTP execution, provisioning, and cleanup
  belong outside this package.
- Suites exercising required capabilities declare bounded dependency profiles
  with exact contract/version/digest pins. Verify the supplied artifacts and
  each profile's transitive graph from its applicable scenario calls. A
  scenario's optional `profiles` selects known profile IDs; omission applies
  to all, and every profile needs an applicable scenario. Cover each exercised
  root requirement's support range in a profile actually calling that root;
  do not imply all versions or Cartesian combinations were tested. External
  setup/verification calls never count as root capability coverage.
- Conformance templates can escape marker interpretation recursively with
  `{ $literal: value }`. Captures need guaranteed paths or an exact successful
  presence/equality assertion. JSON Pointers traverse objects, arrays and maps;
  V1 rejects overlapping ancestor/descendant assertions.
- Replay keys, operation completion, eventual queries and pagination are
  bounded declarative controls, not an executor. Preserve their restrictions
  in `fixtures/protocol-v1/conformance-controls.md`. Aggregate/per-profile
  coverage is descriptive; fresh disposable isolation applies per applicable
  scenario/profile pair, even on failure.
