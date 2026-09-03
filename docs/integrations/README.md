# Integration development

Ulvia integrations are authored as one current source tree and released as
immutable packages. Released history belongs to repositories, not to copied
`versions/` directories in the source tree.

This section documents the supported workflow:

- [Creating a release](./releases.md) covers source layout, SemVer, audits,
  local releases, dependencies, and operational practices.
- [Business upgrade fixtures](./upgrade-fixtures.md) explains how an
  integration creates realistic old-version state and verifies it after an
  upgrade.
- [Remote publication](./remote-publication.md) explains the `ulvia push`
  trust boundary, configuration, immutability, and recovery behavior.
- [Stripe Connect seller terms](./stripe-connect-seller-terms-published-page.md)
  documents the runtime publication and immutable acceptance model used by
  Stripe Connect.

## Source layout

An official integration normally lives below
`packages/resources/official-integrations/integrations/<group>/<kind>/`:

```text
<kind>/
├── integration.json
├── definition.json
├── definitions/
├── connectors/
├── tests/
└── release-notes.txt
```

`integration.json` declares the current version with `path: "."`. The package
builder excludes `integration.json`, `tests/`, and `.registry/` from runtime
package bytes. Tests remain beside the source they specify, while immutable
repositories retain every released package.

The definition version and the version declared by `integration.json` must
match. Never change the contents of an already released `kind@version`.

## Command summary

Commands below use the workspace script. An installed CLI can use the same
arguments directly as `ulvia ...`.

```bash
bun run ulvia -- pull commerce --all-versions
bun run ulvia -- audit commerce
bun run ulvia -- release commerce
bun run ulvia -- release --all
bun run ulvia -- push commerce
bun run ulvia -- push --all
bun run ulvia -- status
bun run ulvia -- dev
```

The persistent local repository is application data under
`$XDG_DATA_HOME/ulvia` or `~/.local/share/ulvia`. Set `ULVIA_DATA_DIR` to an
absolute path when an isolated repository is required. Do not commit that
directory.

`ulvia push` promotes only immutable local releases. Remote admission reruns the
shared verification plan in server-owned disposable infrastructure, and the CLI
then verifies that the public repository returns the exact local digest.
