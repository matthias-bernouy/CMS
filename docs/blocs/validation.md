# Develop And Validate A Bloc

The former integration audit, release, repository, and installation workflow has
been removed. During the provider transition, validate Bloc work against the
compiler and the workspace checks; the new collection format has a separate admission API and no publication or
renderer bridge yet.

## Local loop

Run the local CMS with:

```bash
bun run ulvia -- dev
```

Keep view code independent from the editor. Verify the same saved Light DOM in
Control preview and Delivery, including keyboard use, narrow layouts, dark mode,
loading, empty, error, and long-content states.

## Compiler checks

`@bernouy/cms-bloc-compile` validates tags and artifacts and builds the browser
runtime bundle. Tag validation rejects native roots and reserved/invalid custom-element names.
Source validation detects selected registration and navigation patterns; it is
not a complete JavaScript safety analysis. Bundling enforces supported imports
and validates emitted syntax. The Control import path additionally checks source
bundles, default content and managed native-child structure.

When changing compiler behavior, add a focused test beside
`packages/features/cms-bloc-compile/tests/`.

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

There is currently no supported collection publication command. Do not restore
the removed package repository, integration manifests, or installation APIs to
ship a Bloc. Contract/provider admission and Mongo catalogues already exist. Collection
publication, installation, renderer compilation and a live conformance runner
remain separate work. The authenticated `/api/bloc` import described in
[authoring](authoring.md) still supports the existing compiled format.
