# @bernouy/ulvia-contracts

Platform package for the Ulvia contract language and immutable release validation.

- Depend only on Foundation or Platform; never import features, surfaces or runtimes.
- Preserve the bounded `ulvia-schema/v1` vocabulary, strict I-JSON parsing,
  canonical bytes and SHA-256 digests. Never coerce values or repair persisted data.
- Preserve directional compatibility, exact parent pins and stable capability IDs.
- HTTP/MCP exposure is explicit. Compile transport plans before runtime execution.
- Documentation and mocks are verified release data. Search and indexing are feature-owned.
- `ContractReleaseReader` is read-only. Catalogue publication, metadata mutation and
  memory/Mongo catalogue implementations belong to `@bernouy/repository`.
- Keep public exports explicit and adapter-light. Interfaces contain no executable code.
- Contract source scanning and filesystem authoring remain in Repository build tooling.
