# CmsCore Documentation

This directory documents contracts that affect several packages. Package-local
implementation notes live in each package's `AGENTS.md`.

## Architecture

- [Structure.md](./Structure.md) explains the monorepo layers, package roles,
  dependency direction, and feature package anatomy.
- [import-rules.md](./import-rules.md) defines allowed import paths, package
  boundaries, and adapter subpath rules.
- [commit-convention.md](./commit-convention.md) records the commit message
  convention used in this repository.

## Surfaces

- [api-folder.md](./api-folder.md) documents the file-routed REST API convention
  used by `@bernouy/cms-control`.
- [static-folder.md](./static-folder.md) documents the static HTML routing and
  template system used by `@bernouy/cms-control`.

## Authoring And Gateway

- [cms-bloc-development.md](./cms-bloc-development.md) documents the contracts
  for authored blocs and editor-facing bloc code.
- [auth-system-gateway.md](./auth-system-gateway.md) documents the readonly
  system auth gateway provider exposed through `/.cms/gateway/system-auth/*`.
- [supabase-gateway-import.md](./supabase-gateway-import.md) documents the
  guided Supabase provider import and optional RPC metadata function.
