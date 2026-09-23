# @bernouy/cms-contracts

Feature package for immutable CMS release formats and their admission rules.

## Layout

- `src/interfaces/` contains release, schema, binding, and catalogue types.
- `src/core/` owns parsing, schema validation, binding compilation, admission,
  compatibility, and protocol primitives.
- `src/default-implementation/memory/` owns the in-memory release catalogue.
- `src/exports/` defines the stable package subpaths independently of this
  internal layout.

## Boundaries

- The root export exposes contract release parsing, canonicalization, digests,
  and protocol types.
- `@bernouy/cms-contracts/schema` exposes the bounded `ulvia-schema/v1`
  vocabulary, parsing, and value validation.
- `@bernouy/cms-contracts/bindings` exposes HTTP binding definitions and the
  compiler that produces immutable execution plans.
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
- Object schemas are closed. Dynamic string-keyed objects use the explicit
  `map` schema kind.
- Schema compatibility is directional: old inputs must remain valid for the
  new release, and new outputs must remain valid for old consumers. Admit a
  minor schema change only when inclusion is proven; unknown relationships
  require a major. Documentation-only or semantically equivalent changes may
  remain patches.
- Binary media types form an explicit per-release set, not a global allowlist.
  Syntax validation does not prove that bytes match the declared format.
- Binding compilation must account for every top-level input property exactly
  once and must reserve security, identity, tracing, and transport headers for
  the gateway.
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
