# @bernouy/secret-store

CMS-agnostic secret storage, `${VAR}` reference parsing, and secret resolution.

The root entrypoint exposes contracts, validation, reference helpers, the
in-memory store, and resolver composition. `/mongo` exposes encrypted Mongo
persistence backed by `@bernouy/envelope-crypto`.

Secret values and resolved headers must never be logged. HTTP policy and
product-specific authorization belong to consuming features and surfaces.

See the [workspace package map](../../../docs/architecture/packages.md). Licensed
under the repository [MIT License](../../../LICENSE).
