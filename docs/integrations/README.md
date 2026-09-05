# Integration development

Ulvia integrations are authored as one current source tree and released as
immutable packages. Released history belongs to repositories, not to copied
`versions/` directories in the source tree.

This section documents the supported workflow:

- [Source and collection model](./model.md) defines ownership, resource
  selection, endpoint bindings, contracts, themes, and dependency closure.
- [Integration theme contracts](./themes.md) defines shared Ulvia tokens,
  collection hooks, private variables, and site-owned overrides.
- [Creating a release](./releases/README.md) covers source layout, SemVer, audits,
  local releases, dependencies, and operational practices.
- [Local integration development](./local-development.md) covers the persistent
  CMS, MongoDB, Supabase, selective installation, and end-to-end acceptance.
- [Site acceptance with local data](./site-acceptance.md) explains how to
  reproduce a real site safely with public configuration, fictional business
  data, provider simulations, and visual checks.
- [Business upgrade fixtures](./releases/upgrade-fixtures.md) explains how an
  integration creates realistic old-version state and verifies it after an
  upgrade.
- [Remote publication](./releases/remote-publication.md) explains the `ulvia push`
  trust boundary, configuration, immutability, and recovery behavior.
- [Stripe Connect seller terms](./stripe-connect-seller-terms-published-page.md)
  documents the runtime publication and immutable acceptance model used by
  Stripe Connect.

## Source layout

An official source or collection normally lives below
`packages/resources/official-integrations/integrations/<group>/<kind>/`:

```text
<kind>/
├── integration.json
├── definition.json
├── definitions/
├── blocs/             collection view and editor sources, when applicable
├── connectors/        Source infrastructure, when applicable
├── tests/
└── release-notes.txt
```

`integration.json` declares the current version with `path: "."`. The package
builder excludes `integration.json` and `tests/` from runtime package bytes.
Tests remain beside the source they specify, while immutable
repositories retain every released package.

The definition version and the version declared by `integration.json` must
match. Never change the contents of an already released `kind@version`.

Current definitions use `cms.integration.definition.v2` and explicitly declare
`type: "source"` or `type: "collection"`. Legacy definitions remain readable
only as immutable upgrade baselines.

The current model deliberately has no `template` package type. Pages, site
blocs, logos, favicons, public organization settings, and `--site-*` variables
belong to CMS site data. A reusable collection must not become coupled to the
first site that used it.

The official author tree currently has one theme-only collection and one bloc
collection: `ulvia@1.0.0` publishes `ulvia-theme@3` with no blocs, while
`mossa@1.0.0` publishes the `mossa-*` bloc catalogue and consumes Ulvia's
tokens. Sources remain data and runtime capabilities; notably, `forms` remains
a source while its former rendering blocs do not. See the
[source and collection model](./model.md#current-source-inventory) for the
complete supported source inventory.

## Command summary

Commands below use the workspace script. An installed CLI can use the same
arguments directly as `ulvia ...`.

```bash
bun run ulvia -- pull commerce --all-versions
bun run ulvia -- audit commerce
bun run ulvia -- audit --all
bun run ulvia -- release commerce
bun run ulvia -- release --all
bun run ulvia -- push commerce
bun run ulvia -- push --all
bun run ulvia -- status
bun run ulvia -- dev
```

`audit` and `release` do not need a `--from` argument. They discover every
known, installable older coordinate from the local repository and verify each
applicable upgrade. Use `pull --all-versions` before authoring when remote
history is authoritative.

The persistent local repository is application data under
`$XDG_DATA_HOME/ulvia` or `~/.local/share/ulvia`. Set `ULVIA_DATA_DIR` to an
absolute path when an isolated repository is required. Do not commit that
directory.

`ulvia push` promotes only immutable local releases. Remote admission must rerun
the shared verification plan and return the exact public digest. That remote
gate is separate from local package verification and downstream site acceptance.
