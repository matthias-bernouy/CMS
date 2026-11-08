# Discover reusable resources

Use `repository.search` before creating a collection or Bloc when a reusable resource may already exist. Search the repositories configured by the host, before installation. This is separate from `documentation.search`, which searches the site's selected contracts and their exact ancestors.

## Search and inspect

Ask for the desired behavior, for example `product card with price`, `carte produit avec prix`, or `inventory management`. Filter `kinds` to `bloc`, `collection`, `contract` or `provider-manifest` when appropriate. Use `contractId` to find resources declaring that contract. Exact resource identifiers have priority.

Search returns the latest non-yanked release of each resource within a publisher. Bloc hits include their collection reference and `blocId`. Results from multiple repositories are combined by rank, not by comparing their raw similarity scores. Same-version digest conflicts retain their repository identity. Search considers at most fifty candidates per repository; pagination traverses this bounded candidate set. A catalogue, ranking-mode or source-availability change can invalidate a continuation cursor; restart the search on `REVISION_CONFLICT`.

Read a result with `repository.get`, passing its `repositoryId` and complete `reference`. For a Bloc, also pass `blocId`. A collection overview lists Bloc descriptors, translations, dependencies, exports and examples. Read a specific example using `exampleId`. Follow `nextOffset` to read the remaining JSON. Reads verify the release digest and coordinates, do not install resources and never execute returned source. A release can remain readable after withdrawal even though search excludes it.

Inspect capabilities, input/output schemas, exact parent pins, collection requirements and Provider implementations before deciding to reuse. A listed Bloc may be usable by Pages without being exported for another collection. A Provider manifest declares implementations; it does not prove that a running service is available or connected. Installation, Provider approval and contract selection remain separate explicit operations.

## Availability and limits

Inspect `mode` and `degraded`: semantic retrieval is optional and lexical fallback remains usable. `partial` and `unavailableRepositories` identify configured sources that failed or do not support discovery. Missing sources are not proof that a resource does not exist. Users cannot supply arbitrary repository URLs through these tools.

Repositories index public metadata only. Hidden Blocs are omitted from search. Asset bodies and documentation bodies are not downloaded to answer a query. Metadata descriptions determine semantic usefulness; poor or missing descriptions cannot be repaired by the search algorithm.

## Refusals

`NOT_FOUND` means the exact release, Bloc or example is absent. `RELEASE_MISMATCH` means bytes, coordinates or repository metadata disagree with the requested release; do not retry it as a temporary outage. `REVISION_CONFLICT` requires restarting a search after its cursor expires. `INVALID_INPUT` requires correcting the request. `CATALOGUE_TOO_LARGE` reports a bounded corpus or response budget. Only `CORE_UNAVAILABLE` represents a temporary infrastructure failure. Remote diagnostic text is not returned to the caller.
