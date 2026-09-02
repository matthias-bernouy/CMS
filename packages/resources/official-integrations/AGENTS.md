# @bernouy/cms-official-integrations

Authoring sources for official CmsCore integrations.

## Boundaries

- Each integration directory owns its current runtime resources, manifest,
  release notes, and release verification tests. The root `index.ts` may expose
  resource path constants only.
- This package may depend on feature contracts to express resources, but it must
  not import surfaces or runtimes.
- Do not add runtime installation logic, HTTP handlers, database adapters, or
  surface imports here.
- Keep provider-specific assets under `connectors/<provider>/`.
- Keep immutable historical versions in integration repositories, not in the
  authoring source tree.
- Treat `.registry/packages/` as digest-addressed official repository seed data;
  never edit an existing object in place.
- Keep release-owned tests under the integration's `tests/` directory. Those
  tests, `integration.json`, and `.registry/` are authoring inputs and must not
  enter runtime package bytes.

## Rules

- Preserve deployable connector files as plain source resources.
- Do not store real credentials, project refs, or environment-specific secrets.
- Keep integration resources provider-neutral unless the file lives under a
  connector directory.
