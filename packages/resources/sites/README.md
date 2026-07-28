# CmsCore Official Sites

Declarative sites authored with the same pages, integrations, Blocs, bindings,
and theme resources that CmsCore exposes to its users.

## Sites

- `cms-repository-hub` is the public integration catalogue for a repository
  managed by a CMS instance. It reads the anonymous, same-origin repository API
  and keeps all browser state in query parameters.

## Authoring And Deployment

Each site directory is a regular `p9r` project. From that directory, use
`p9r push --dry-run` and then `p9r push --yes` to deploy the complete `site/`
tree. The full push installs the pinned integrations before publishing pages.
Deployment credentials and the target CMS Control URL are supplied to the CLI;
they are never stored here.

The production target must be the repository-management CMS, because that
runtime exposes the enriched catalogue projection consumed by the page. The
current clean-clone `p9r dev` and `p9r preview` composition does not provide that
projection or materialize imported integration Blocs automatically; use a
deployed CMS preview until that development composition is added.

The repository hub pins the existing `basic-blocs@1.0.0` and
`documentation-blocs@1.0.0` integrations. Its catalogue endpoint is provided
by the repository surface, not by a site-specific integration.
