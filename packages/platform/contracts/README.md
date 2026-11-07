# @bernouy/ulvia-contracts

The Platform contract language for Ulvia. This package defines and validates
provider-neutral capabilities without importing any CMS feature or choosing storage.

| Export | Responsibility |
| --- | --- |
| `.` | Release definitions, parsing, admission, canonicalization and exact lineage resolution. |
| `./schema` | Bounded schemas, value validation and release-specific output projection. |
| `./bindings` | Explicit HTTP/MCP exposure, HTTP plans and scalar codecs. |
| `./compatibility` | Versions, directional compatibility and evolution comparison. |
| `./catalogue` | Read ports, exact lineage resolution and bounded immutable-artifact cache. |
| `./protocol` | Strict JSON, I-JSON, canonical bytes and protocol primitives. |
| `./documentation` | Release-document metadata, Markdown and asset verification. |
| `./validation` | Shared validation primitives used by persistent catalogue implementations. |

`ContractReleaseReader` exposes reads only. Persistent catalogues, publication,
yanks and deprecations belong to `@bernouy/cms-repository/contracts/catalogue`
and its explicit Mongo adapter. Authoring source assembly remains in
`@bernouy/cms-repository/repository/authoring/build`.

Detailed format rules are documented in [the contract model](src/README.md).
