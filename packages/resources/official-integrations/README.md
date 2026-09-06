# CmsCore Official Integrations

Authoring sources for official CmsCore integration resources.

This package stores declarative resources and deployable connector source. Generic
installation orchestration belongs to `@bernouy/cms-integrations`; provider
configuration, reconciliation, and health belong to the integration.

## Layout

```text
integrations/<group>/<kind>/
|-- integration.json
|-- release-notes.txt
|-- definition.json
|-- definitions/
|-- blocs/
|-- connectors/<provider>/
`-- tests/
    |-- guarantees/
    |-- checks/
    `-- fixtures/
```

The directory name must match the integration `kind`. The authoring tree owns
only the current version. Released history is immutable repository data and is
not copied into source version directories.

`integration.json` declares the integration kind, display metadata, current
version, and `path: "."`. It is authoring metadata and is excluded from the
runtime package, as are `tests/`.

`definition.json` is the version entry point. It may contain the definition
directly or declare a recursive bundle rooted under `definitions/`; resolution
always produces one canonical installable definition whose `kind` and `version`
match the root index.

Provider-specific deployment assets live under `connectors/<provider>/`.
Supabase SQL units use explicit
`sql/*.manifest.json` entry points, alongside Supabase config fragments and Edge
Function source.

Release-owned tests live beside the source under `tests/`. `guarantees/`
contains durable public behavior, `checks/` contains current implementation and
platform checks, and `fixtures/` contains test-only data. None of these files
enter runtime package bytes.

Released coordinates and their verification bundles live only in integration
repositories. Pull remote history into Ulvia's persistent local repository when
an audit needs upgrade baselines; never copy repository objects back into Git.
