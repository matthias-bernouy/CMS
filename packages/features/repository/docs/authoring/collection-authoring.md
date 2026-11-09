# Prepare, publish and install a collection

Collection preparation validates source. Publication creates an immutable Repository release. Installation selects a release on a site. These are separate operations with distinct authorization and state.

## Inspect and prepare sources

For a new collection, start with [the complete source example](collection-source.md). `sourceJson` is one serialized object containing `files: [{path, content}]` and optional `assets`; each file's `content` is a string, including JSON files. The tool's string input schema does not describe this nested format.

Before publishing, read `get-connection`. If necessary, use `configure-connection` with a PAT created by the target Repository account. Use `list-namespaces` to inspect its live inventory, or `claim-namespace` to claim an available name. Only active owned namespaces permit publication. The encrypted PAT remains on the server and is never returned by these tools.

Read `get-collection-sources` before changing a previously published collection. Preserve exact dependency and binary asset references from that snapshot. Collections contain reusable resources and examples; create site Pages separately through Content.

Every Bloc has a native root contract. Listed Blocs use translated descriptions, categories and appropriate examples. Author example `definition.json` and `document.html` with explicit preview frames. Page content and mutable site configuration remain site-owned.

For a new or redesigned Bloc, follow [Design a reusable Bloc](bloc-design.md) before preparing sources. It covers the editor contract, visual system, interaction states and examples.

## Make colors reusable

Put literal colors in theme-token defaults and site theme values. Bloc paint styles must consume declared or explicitly imported tokens. Prefer semantic `ulvia/mossa` roles such as `background-surface`, `text-primary`, `primary`, `on-primary`, `border-default`, `focus-ring` and feedback colors when suitable. Import the exact token IDs from a dependency; declaring its collection name alone does not authorize every token. A new role may use a translated token in your collection, exported when other collections should reuse it.

Preparation rejects raw hexadecimal, named/system and functional colors in UI paint, including borders, shadows, gradients, SVG paint and literal fallbacks. Local aliases are followed across selector variants; they cannot hide a palette. Do not redefine theme tokens inside Bloc CSS. Use `var(--ulvia--mossa--primary)` or `color-mix(in srgb, var(--ulvia--mossa--primary) 20%, transparent)` after importing that token. `transparent`, `currentColor`, inheritance/reset keywords and `none` remain available where CSS permits them.

Select finite CSS states rather than writing native paint, `cssText`, style elements, CSS rules or paint attributes from behavior. Owned variables can carry dynamic geometry; variables feeding UI paint require static theme-token-based values. Color-data controls may render their dedicated canvas previews, and intrinsic image colors stay in immutable assets. These static checks are authoring rules, not a JavaScript security sandbox.

For a copied site, map the source palette to semantic roles and change the destination site's theme values. Keep the Bloc reusable across sites. Review light/dark, hover, focus and error contrast after installation. A custom color control should edit a theme value or business color data, not inject raw Bloc styling.

## Prepare and correct

Call `prepare-collection` with the complete source snapshot. A successful tool invocation can still return `valid: false`: inspect `diagnostics[].message`, correct the sources and prepare again. Publication needs `valid: true`, a `preparationId`, a `digest` and a reviewed `approvedBrowserRiskDigest`. Retain those exact returned values; do not construct them from source text.

Compilation does not prove visual quality. Inspect the installed result with a browser when available and report any missing visual or interaction checks.

Inspect `diagnostics` even when `valid` is true. Errors block preparation; warnings report incomplete validation. Entries carry a stable code, severity, message and optional location, related resource IDs and suggestion. `analysis.truncated` means additional validation issues were omitted. Correct the reported issues and prepare again.

Preparation checks HTML structure after expanding collection examples. These diagnostics are transient feedback, not immutable release fields or a new rule applied while reading stored releases.

## Publish the reviewed preparation

Inspect its digest and executable browser-code risk. Call `publish-collection-operation` with the returned `preparationId` and `expectedDigest: digest`. Supply the command's `idempotencyKey` beside `input` in MCP. Follow `get-publication-operation` with the same preparation, digest and returned `operationId` until `succeeded` or `failed`. An accepted operation is not a published release. The synchronous `publish-collection` capability remains available with its original signature; prefer this durable workflow. Publication creates an immutable `(publisherId, collectionId, version)` release; it does not install it. Use a new version for changed published sources.

After an uncertain response, inspect the available release and retained sources before retrying. Repeating publication of the exact preparation cannot overwrite different bytes at an existing coordinate. Do not change source, version or expected digest merely to retry a lost response. A discarded or cleaned-up preparation must be prepared again. The official Provider bounds their number and cleans preparations older than seven days when preparing new work; preparation storage is not a permanent editing workspace.

## Install or upgrade separately

For a first installation, read `ulvia/cms.installations/list-collection-installations`, then call `install-collection` with that `expectedRevision` and `targets` containing the prepared `repositoryId`, `publisherId`, `collectionId`, `version`, `digest` and `approvedBrowserRiskDigest`. On a revision conflict, reread the installations and review what changed before retrying.

For an existing installation, use `plan-collection-upgrade`. Apply only a reviewed `applicable` plan through `apply-collection-upgrade`, retaining its exact targets and `planDigest`. The MCP arguments put the command's `idempotencyKey` beside `input`, not inside it. The initial response is an `operationId`: follow `get-operation` until `succeeded` or `failed`. A failed operation exposes `errorCode` and `errorOutput.message`. An accepted handle is not a completed upgrade.

A site edit can invalidate a reviewed plan. Inspect the failure, make a fresh plan and use a new idempotency key for the changed request. Replaying the same request with its original key retrieves the same operation; reusing that key with different input is a conflict.

Read the installed release back. Then get an example through Content `examples.list` and `examples.get`, copy `document.html` into an ordinary Page draft and verify that draft before publication. Collection upgrades switch reusable resources; they never automatically rewrite the Page's authored HTML.

## Publication Preflight And Recovery

Preparation returns `preflight: "complete"` when the configured Repository has
checked the candidate against its authoritative publication history, including
yanked releases. Evolution refusals return `valid: false` with a typed
`collection.publication.*` diagnostic and version guidance. The check does not
publish, upload, install or grant execution authority.

`preflight: "incomplete"` includes a warning. This applies when the Repository
check is unavailable or exceeds its evidence budget: candidate metadata above
8 MiB, more than 64 historical releases, or more than 32 MiB of historical
metadata. An incomplete check is not a compatibility guarantee. Publication
always rechecks current ownership and evolution under the Repository write lock.

An exact publication refused after preparation returns `INVALID_INPUT` with a
safe `publicationCode` and an optional `publicationResource`. Correct the version
or resource identity and prepare again. Technical failures remain unavailable;
they must not be interpreted as version incompatibility.

Preparation is a local preview. Publication sends the exact prepared editable
sources and binary assets to the Repository; the CMS does not recompile them on
publish. The Repository rebuilds against its own catalogue and refuses a digest
that differs from the reviewed preparation. It retains verified sources before
making the release visible, so new collection publications no longer have a
separate source-retention stage.

A lost response can still leave `publicationState: "unknown"`. Retry the same
preparation and digest after restoring access. Do not change source or version
merely to resolve uncertainty. Every retry requires current namespace ownership
and the pinned Repository identity. Historical `sources-pending` receipts remain
readable; an explicit retry verifies their sources through the server build.
A failed durable operation is terminal: inspect its error code and use a new
idempotency key for a fresh attempt after correcting the cause.

Preparations expire after seven days, including publication retries. Missing,
altered, foreign-instance and expired preparations refuse before publication.
After expiration, prepare the original exact sources again; an identical
published release remains immutable and its exact replay is idempotent.
