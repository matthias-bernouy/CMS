# @bernouy/cms-official-integrations

Local repository of official CmsCore integration resources.

## Boundaries

- This package stores versioned integration resource files only: manifests,
  source contracts, typed declarative definitions, connector blueprints, SQL,
  Edge Functions, and docs.
- This package may depend on feature contracts to express resources, but it must
  not import surfaces or runtimes.
- Do not add runtime installation logic, HTTP handlers, database adapters, or
  surface imports here.
- Keep provider-specific assets under `versions/<semver>/connectors/<provider>/`.
- Keep cross-version metadata at the integration root. Keep version-specific
  assets under `versions/<semver>/`.

## Rules

- Preserve deployable connector files as plain source resources.
- Do not store real credentials, project refs, or environment-specific secrets.
- Keep integration resources provider-neutral unless the file lives under a
  connector directory.
