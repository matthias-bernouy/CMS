# @bernouy/cms-providers

Feature package for provider manifests, CMS-owned provider installation models,
and their pure validation. It does not establish live connections.

## Layout

- `src/manifests/interfaces/` contains manifest contracts and types.
- `src/manifests/core/` owns parsing, version ranges, reference validation,
  admission, and manifest limits.
- `src/installations/interfaces/` contains approved installations, runtime
  reports, and bootstrap protocol DTOs. `src/installations/core/` owns their
  pure parsers, manifest-consistency checks, and protocol metadata.
- `src/selections/interfaces/` contains exact per-site contract selection types;
  selection planning and storage are not implemented yet.
- `src/exports/` defines the stable package exports.

## Boundaries

- Provider manifests are immutable provider claims. They reference exact
  admitted contract releases and declare provider-to-gateway requirements.
- Manifest requirements are authority. They must be validated at publication
  time and must never be expanded from a runtime report.
- Manifests may describe credential slots, but never contain credential values
  or secret references belonging to an installation.
- Endpoint policies contain allowed origins, not an installation's selected
  endpoint.
- This package may depend on public `@bernouy/cms-contracts` exports. It must
  not import that package through workspace source paths.
- HTTP execution, gateway routing, environment access, and production adapter
  selection do not belong in this package.

## Installation boundary

- V1 connection authentication is a dedicated Bearer token. Persist only an
  exact `${SECRET_KEY}` reference; manifest credential slots are not additional
  implemented connection mechanisms. Provider-hub business credentials stay
  on the hub.
- Provider-to-CMS gateway credentials are separate from CMS-to-provider tokens.
  A gateway registration request is a sensitive, ephemeral wire DTO: never
  persist it, log it, or return it in an admin response.
- An installation represents an explicitly approved manifest version and digest
  for one site, endpoint, provider, and remote account. Several sites may share
  the same remote business account through independent installations.
- `enabled`, `disabled`, and `revoked` describe administrative intent, not live
  readiness. Drafts, probes, approval actions, and state transitions require a
  future installer; parsing a record does not authorize its creation.
- Runtime reports are observations, never authority. Validate their identity,
  exact manifest pin, build range, origin, and every reported exact release
  against a trusted admitted manifest. During reconnection, supply the expected
  account ID. Missing implementations imply no availability claim.
- Reports cannot expand manifest requirements, establish gateway grants, or
  change site selections. Observation timestamps belong to the CMS.
- Apply configured byte/depth/count limits to object and JSON entry points;
  reject unknown fields, duplicate JSON keys, sparse arrays, and invalid UTF-8.
  Return independent immutable snapshots without freezing caller-owned data.
- URL parsing validates syntax only. HTTPS is required except for literal
  loopback HTTP development origins. Future transport adapters must enforce
  network policy, timeouts, bounded reads, and credential-safe redirect handling.

## Manifest admission

- Parse manifests from `unknown` or strict JSON and reject unknown fields,
  duplicates, sparse arrays, ambiguous ranges, and configured limit breaches.
- Build ranges must accept at least one possible SemVer, including explicitly
  admitted prereleases. This does not require a published or running build.
- Resolve every implemented contract by exact version and digest through a
  `ReleaseCatalogue`.
- Resolve every capability requirement against at least one non-yanked
  compatible contract release.
- Use the public contracts range engine for matching, canonical normalization,
  and inclusion. Each implemented capability's mandatory requirements must be
  covered by non-optional manifest requirements without dropping any accepted
  dependency alternative. Additional implementation-specific requirements are
  permitted.
- Reject duplicate implementations, duplicate requirements, and dependency
  cycles between matching implemented releases in the same manifest. Graph
  edges respect version ranges and capability existence.
- Canonicalize and hash only after structural and semantic validation.

## Multi-release support

- A manifest may claim several exact releases of one contract, keyed by
  `(contractId, version)` and individually verified by digest. Canonical ordering
  is ordinal, independent of the environment locale.
- Admission validates claims, not running implementations. Each served release
  still needs release-specific conformance evidence. Do not infer old-release
  support from a newer build or from contract SemVer alone. One exact release
  and installation is selected per `(siteId, contractId)`. Enforcing this across
  a site's graph, storing selections, and runtime execution remain future work.
