# Working with Ulvia

Ulvia separates site content from reusable collection resources. Start with the user's goal, inspect what the site already provides, and use the selected tools and documentation to choose a workflow.

## Discover tools and contracts

A contract defines capabilities and their inputs, outputs, errors and behavior. The site selects exact contract releases and approved Providers implement them. Only capabilities with MCP bindings appear as tools. Use the current tool catalogue and schemas for exact arguments; do not construct tool names from capability IDs.

Documentation refers to capabilities as `contractId/capabilityId`, for example `ulvia.cms.installations/documentation.search`. Find the corresponding tool using its description and contract/capability metadata when your client exposes it. MCP arguments wrap capability inputs in `input`. A keyed command puts its `idempotencyKey` beside `input`.

Reading a guide does not grant access to the tools it mentions. A workflow can span several contracts; check that the required tools are available and report missing access or capabilities before claiming completion.

## Consult documentation when it helps

Search before an unfamiliar workflow, a design decision or an ambiguous rule. A simple operation with a clear tool schema does not require a documentation search every time. Reuse a guide already read while its exact release remains applicable.

Use `ulvia.cms.installations/documentation.search` with a natural-language description of the goal. You can search across selected contracts without knowing which one owns the answer. Example capability inputs, wrapped in `input` when calling an MCP tool:

```json
{"input":{"query":"How do I reproduce a site using reusable Blocs and editable Page content?"}}
```

```json
{"input":{"query":"How do I prepare, publish and install a collection?"}}
```

```json
{"input":{"query":"How do I configure the site's 404 and login pages?","contractId":"ulvia.cms.content"}}
```

Optional `contractId` and `capabilityId` filters narrow the search. Inspect `mode` and `degraded`: lexical-only retrieval does not prove that no relevant guide exists.

Read a result with `ulvia.cms.installations/documentation.get`, passing its exact `reference` object unchanged. Documents referenced by tools can be read directly without a search. Continue with `offset: nextOffset` until the relevant content is complete; keep the same reference. Search excerpts are not complete procedures. If the selected release changes and a reference becomes obsolete, search again. See [documentation search and reading](documentation.md).

## Keep site content editable and resources reusable

- A Page owns site-specific editorial text, destinations, media, routes and publication state. Use the Content contract to edit it.
- A Bloc provides reusable structure, declared slots, styles and optional behavior. Stable interface labels may belong to collection translations; site editorial copy should remain editable in the Page or an appropriate shared configuration.
- A composition assembles reusable Blocs and defines how Page content fits their slot contracts.
- A theme centralizes the visual identity through tokens. Prefer suitable semantic tokens exported by `ulvia-official`; declare explicit dependency imports. Put literal colors in theme values rather than Bloc paint styles.
- A collection distributes versioned reusable resources and examples. An example is not a site Page; copy it into a Page draft when appropriate. Publishing, installing and upgrading a collection are separate operations.

Before recreating a site, inspect installed resources, identify recurring patterns, and decide what editors must be able to change. Reuse suitable Blocs and create missing structures with clear slot contracts. Check that changing a destination, adding a repeated item or editing prose does not unnecessarily require publishing another collection release.

## Follow the relevant workflow

Use [the installations overview](overview.md) for installation and upgrade capabilities. Search for these guides in their owning contracts:

- `ulvia.cms.repository`: "Prepare, publish and install a collection" and "Build a minimal collection source snapshot".
- `ulvia.cms.content`: guides for creating and publishing Pages, verifying drafts, revisions and configuring system pages.
- `ulvia.cms.files`: the site-files guide for uploads and file management.

Follow the selected tool schemas and each guide's prerequisites. Do not assume that a guide's contract version is also the version selected for every other contract in the workflow.

## Verify and finish

Run the checks available for the resources you changed, inspect diagnostics, correct the causes and verify again. A successful tool call may still return an unsuccessful domain result, such as collection preparation with `valid: false`. An accepted asynchronous operation is not complete: follow its operation status.

Read back the requested state. For design work, review rendering, interactions, links and applicable light/dark themes with a browser when available. Static validation does not establish visual quality. Report what you verified and any remaining checks; never claim a browser review or publication merely because a guide recommends it.
