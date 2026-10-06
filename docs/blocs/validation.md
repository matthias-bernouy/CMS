# Develop And Validate A Bloc

The former integration package workflow has been removed. Validate Bloc work
against the collection release admission, compiler, and workspace checks. The
current collection format has local and remote immutable publication plus a
Control/Delivery renderer bridge.

## Local loop

Run the local CMS with:

```bash
bun run ulvia -- dev
```

Keep view code independent from the editor. Verify the same saved Light DOM in
Control preview and Delivery, including keyboard use, narrow layouts, dark mode,
loading, empty, error, and long-content states.

## Compiler checks

`@bernouy/cms-repository/collections/build` validates collection Bloc source and
builds the browser runtime bundle. Tag validation rejects native roots and
reserved or invalid custom-element names.
Source validation detects selected registration and navigation patterns; it is
not a complete JavaScript safety analysis. Bundling enforces supported imports
and validates emitted syntax. The Control import path additionally checks source
bundles, default content and managed native-child structure.

When changing compiler behavior, add a focused test beside
`packages/features/cms-repository/tests/collections/admission/tooling/`.

## Workspace checks

From the repository root run:

```bash
bun run format
bun run check:all
bun run build
bun test
```

`check:all` covers architecture, package exports, repository shape, style, UI
contracts, and the TypeScript project. The build also verifies the generated
Control bundle used by the browser.

## Publication status

Use `ulvia release` for explicit authored directories, then `ulvia push` for one
exact admitted coordinate. Do not restore the removed package repository or
integration manifests. The receiving repository re-runs collection,
contract/provider and release-evolution validation before making bytes visible.
Installation remains a separate Control action, and a live provider conformance
runner remains open. There is no mounted private Bloc import route; authored
collection Blocs use the explicit release pipeline described in
[authoring](authoring.md).
