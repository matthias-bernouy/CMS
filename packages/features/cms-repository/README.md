# @bernouy/cms-repository

CMS repository formats, admission rules and pure validation in one feature
package. The contracts domain defines provider-neutral releases and conformance
suites; the providers domain defines immutable manifests and separate CMS-owned
installation, runtime-report and contract-selection models. The collections
domain starts with authored bundles, assets and Light DOM compositions.

Contract releases and provider manifests are immutable, versioned publications.
Installations and selections are state for a particular site, with exact pins to
those publications. Runtime reports are observations of a provider, never an
authority to change an approved manifest, gateway permissions or site selections.

## Layout

```text
cms-repository/
├── src/
│   ├── contracts/
│   │   ├── core/
│   │   ├── interfaces/
│   │   ├── default-implementation/
│   │   └── README.md
│   ├── providers/
│   │   ├── manifests/
│   │   ├── installations/
│   │   ├── selections/
│   │   └── README.md
│   ├── collections/
│   │   ├── core/
│   │   ├── interfaces/
│   │   ├── installations/
│   │   ├── sources/
│   │   └── README.md
│   ├── repository-http/
│   │   ├── baseUrl.ts
│   │   └── getBytes.ts
│   └── exports/
│       ├── index.ts
│       ├── contracts/
│       ├── providers/
│       └── collections/
├── tests/
│   ├── architecture/
│   ├── contracts/
│   ├── providers/
│   └── collections/
├── fixtures/
│   ├── contracts/
│   ├── providers/
│   └── collections/
├── AGENTS.md
├── README.md
├── package.json
└── tsconfig.json
```

Contracts do not depend on providers or installation state. Providers consume
the contracts export facade. Collections consume that same facade without
depending on providers. Their authored-bundle admission is not renderer
compilation, site installation or execution authorization.

## Public entry points

| Export | Current responsibility |
| --- | --- |
| `@bernouy/cms-repository` | Type-only entry point for principal domain models |
| `@bernouy/cms-repository/contracts` | Release parsing, admission, canonicalization, digests, mocks and conformance suites |
| `@bernouy/cms-repository/contracts/schema` | Bounded schema vocabulary, parsing and value validation |
| `@bernouy/cms-repository/contracts/bindings` | HTTP binding compilation and pure scalar codecs |
| `@bernouy/cms-repository/contracts/compatibility` | Release evolution and consumer-compatibility checks |
| `@bernouy/cms-repository/contracts/catalogue` | Release catalogue port and deterministic in-memory implementation |
| `@bernouy/cms-repository/contracts/mongo` | Mongo release artifacts and revisioned publication metadata |
| `@bernouy/cms-repository/contracts/protocol` | Strict I-JSON parsing, canonicalization and freezing primitives |
| `@bernouy/cms-repository/providers` | Manifest parsing, reference validation, admission and digest |
| `@bernouy/cms-repository/providers/catalogue` | Immutable manifest catalogue port and memory implementation |
| `@bernouy/cms-repository/providers/compatibility` | Descriptive manifest changes and exact-digest approval requirements |
| `@bernouy/cms-repository/providers/installations` | Parsers, local preparation/approval lifecycle, observations, readiness and revisioned memory store |
| `@bernouy/cms-repository/providers/selections` | Bounded full-site graph planning, revisioned memory store and catalogue dependency source |
| `@bernouy/cms-repository/providers/mongo` | Mongo manifest catalogue, installation and selection stores with revision-checked writes |
| `@bernouy/cms-repository/collections` | Authored release parsing, Light DOM structure, asset and requirement verification, bundle digests |
| `@bernouy/cms-repository/collections/installations` | Revisioned site installations, compatibility analysis, resource digests and atomic migration replacement/restoration |

Use explicit domain subpaths for executable APIs. There are no compatibility
packages or wrappers under the former package names.

## Current scope

The package provides provider-domain workflows, catalogue and storage ports,
deterministic memory implementations, and Mongo release, manifest, installation
and selection stores. It also owns collection admission, repository sources,
revisioned site installations and text overrides. The internal `repository-http/`
directory holds bounded HTTP reads shared by collection and provider sources;
catalogue parsing remains in each domain. Mongo contract release publication
rejects fixture assets until separate byte storage is available.
The Mongo catalogues expose revision tokens from publication metadata for
selection planning. Gateway freshness checks compare the selected site route's
mutable records and do not rescan the global catalogues.
Admission and graph planning validate
artifacts and proposed choices; they do not establish live readiness or attest
that a provider passes a contract. Host authorization and production snapshot
consistency remain composition responsibilities.

See the [contract guide](src/contracts/README.md) for release evolution, schema
and transport profiles, and conformance dependencies. The
[provider guide](src/providers/README.md) explains immutable claims, site state
and the proposed connection protocol. [Provider workflows](src/providers/workflows.md)
details implemented transitions, upgrade boundaries and remaining runtime work.
The [collections guide](src/collections/README.md) documents admitted themes,
texts, views, dashboards, assets and resource requirements. The installed
collection path currently accepts releases without assets or capability
requirements; remote publication, broad view execution and renderer compilation
remain unfinished.
[AGENTS.md](AGENTS.md) defines the domain
boundaries and implementation invariants.
