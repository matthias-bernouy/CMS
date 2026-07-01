# CmsCore Official Integrations

Local repository of official CmsCore integration resources.

This package intentionally stores declarative resources only. Installation
behavior belongs to `@bernouy/cms-integrations`.

## Layout

```text
integrations/<kind>/
|-- integration.json
`-- versions/
    `-- <semver>/
        |-- README.md
        |-- definition.json
        |-- sources/
        `-- connectors/<provider>/
```

The directory name should match the integration `kind`. Version folders use
exact semver values without a leading `v`, for example `1.0.0`.

`integration.json` is the cross-version catalogue index. It declares the
integration kind, display metadata, `stable` and `latest` version pointers, and
the available version directories.

`definition.json` is the exact installable integration definition for one
version. Its `kind` and `version` must match the root index and the version
directory.

Provider-specific deployment assets such as SQL files, Supabase config fragments,
and Edge Function source live under the versioned `connectors/<provider>/`
directory.

Version directories are immutable once published. Add a new version directory
for updates instead of editing an existing released version.
