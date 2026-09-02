# CmsCore Official Integrations

Authoring sources for official CmsCore integration resources.

This package intentionally stores declarative resources only. Installation
behavior belongs to `@bernouy/cms-integrations`.

## Layout

```text
integrations/<kind>/
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
runtime package, as are `tests/` and `.registry/`.

`definition.json` is the version entry point. It may contain the definition
directly or declare a recursive bundle rooted under `definitions/`; resolution
always produces one canonical installable definition whose `kind` and `version`
match the root index and version directory.

Provider-specific deployment assets live under `connectors/<provider>/`.
Supabase SQL units use explicit
`sql/*.manifest.json` entry points, alongside Supabase config fragments and Edge
Function source.

Release-owned tests live beside the source under `tests/`. `guarantees/`
contains durable public behavior, `checks/` contains current implementation and
platform checks, and `fixtures/` contains test-only data. None of these files
enter runtime package bytes.

Legacy integrations may still have `versions/<semver>/` during the migration.
Do not remove one until every released package is recoverable from a repository.
