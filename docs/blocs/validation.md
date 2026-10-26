# Develop And Validate A Bloc

The former integration package workflow has been removed. Validate Bloc work
against the collection release admission, compiler, and workspace checks. The
current collection format has local and remote immutable publication plus a
Kernel renderer bridge.

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

`@bernouy/cms-repository/collections/build` validates collection Bloc source and
builds the browser runtime bundle. Identity validation rejects unnamespaced,
reserved or malformed Bloc IDs.
Source validation detects selected registration and navigation patterns; it is
not a complete JavaScript safety analysis. It also rejects dynamic or foreign
CSS custom-property writes. Bundling enforces supported imports and validates
emitted syntax. Release admission parses every Bloc stylesheet and validates
custom-property ownership, declared Bloc dependencies, theme-token imports and
fallbacks for optional values. The collection import path additionally checks
source bundles, default content and bounded `native-element` slot structure.

When changing compiler behavior, add a focused test beside
`packages/features/cms-repository/tests/collections/admission/tooling/`.

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
