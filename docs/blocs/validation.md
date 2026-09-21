# Develop And Validate A Bloc

The former integration audit, release, repository, and installation workflow has
been removed. During the provider transition, validate Bloc work against the
compiler and the workspace checks; publication will be specified by the new
contract/provider protocol.

## Local loop

Run the local CMS with:

```bash
bun run ulvia -- dev
```

Keep view code independent from the editor. Verify the same saved Light DOM in
Control preview and Delivery, including keyboard use, narrow layouts, dark mode,
loading, empty, error, and long-content states.

## Compiler checks

`@bernouy/cms-bloc-compile` validates tags and artifacts and builds the view and
editor bundles. It rejects native roots, invalid custom-element names, unsafe
navigation, unsupported imports, malformed source bundles, and invalid native
element ownership.

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
ship a Bloc. Provider manifests, immutable contract releases, conformance, and
collection resource delivery will define the replacement boundary.
