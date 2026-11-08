# Develop And Validate A Bloc

The former integration package workflow has been removed. Validate Bloc work
against the collection release admission, compiler, and workspace checks. The
current collection format has local and remote immutable publication plus a
Content-owned rendering pipeline exposed through native delivery resources.

## Local loop

Run the local CMS with:

```bash
bun run ulvia -- services start --version 0.0.1-beta
bun run ulvia -- instance create preview
```

Choose an exact published stack version on first startup from source. Later
`bun run ulvia -- start` reuses the installed digests. Source builds and
`release` do not update running server images or installed collections; use
the explicit image and collection upgrade workflows. See
[development](../development/README.md#local-cms).

Keep view code independent from the editor. Verify the same saved Light DOM in
administration preview and public rendering, including keyboard use, narrow layouts, dark mode,
loading, empty, error, and long-content states.

## Compiler checks

`@bernouy/repository/collections/build` validates collection Bloc source and
builds the browser runtime bundle. Identity validation rejects unnamespaced,
reserved or malformed Bloc IDs.
Source validation detects selected registration and navigation patterns; it is
not a complete JavaScript safety analysis. It also rejects dynamic or foreign
CSS custom-property writes. Bundling enforces supported imports and validates
emitted syntax. Release admission parses every Bloc stylesheet and validates
custom-property ownership, declared Bloc dependencies, theme-token imports and
fallbacks for optional values. The collection import path additionally checks
source bundles, example documents and bounded `native-element` slot structure.
Paint values and their local alias graph must resolve to theme tokens or
allowed CSS keywords; literal colors and literal fallbacks fail preparation
and admission. Compiled behavior is rechecked against color-carrying variables.
See [color admission](theming.md#color-admission), including the limits of the
static JavaScript checks and the canvas channel for color-data previews.

When changing compiler behavior, add a focused test beside
`packages/features/repository/tests/collections/admission/tooling/`.

## Expanded authoring diagnostics

Page writes analyze the expanded document before persistence and expose up to
16 structured diagnostics through the existing mutations. Errors take priority
over warnings; a bounded report includes `analysis.truncated` when findings are
omitted. Truncation cannot turn a failing analysis into a successful write.
Errors refuse a write;
warnings return with the committed revision and are not persisted in Page data.
The authoring analyzer checks main landmarks, native references, repeated IDs,
interactive nesting and links supplied by templates as well as Page content.
It preserves Bloc origins across composition/slot expansion for diagnostics.
Exclusive match cases are considered separately; independent conditions are not
assumed exclusive. Dynamic or budget-limited results remain explicitly unverified.

Broken routes/fragments are warnings for drafts and errors for published content.
Existing draft destinations remain advisory to avoid publication cycles.
Deletion checks effective incoming links, including relative destinations.
Unpublication stays possible and reports incoming links or an incomplete scan.
Bloc replacement checks indexed direct and indirect Page consumers; collection
upgrade planning uses the target definitions and the existing usage snapshot.
These checks do not establish a distributed snapshot or guarantee that another
write cannot later change a destination.

Collection preparation also checks expanded example structure. The CLI prints
preparation diagnostics; MCP and Content mutations return structured feedback
for authoring clients. No visual Page editor is bundled. These checks do not add a capability or change the
release digest based on diagnostics.

New authoring policy is explicit and does not run on ordinary historical artifact
reads or public rendering. The existing immutable grammar validation remains in
place. Full admission-policy versioning is a separate concern.

## Workspace checks

From the repository root run:

```bash
bun run format
bun run build
bun run verify
```

`check:all` covers architecture, package exports, repository shape, style, UI
contracts, logging, dead code and the TypeScript project. The build also verifies
the generated Bloc behavior and binding-core browser runtimes.

## Publication status

Use `ulvia release` for explicit authored directories, then `ulvia push` for one
exact admitted coordinate. Do not restore the removed package repository or
integration manifests. The receiving repository re-runs collection,
contract/provider and release-evolution validation before making bytes visible.
Installation remains a separate administration action. Provider implementations
own their behavioral tests; contract publication validates immutable artifacts.
There is no mounted private Bloc import route; authored collection Blocs use the explicit release pipeline described in
[authoring](authoring.md).
