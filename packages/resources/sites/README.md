# CmsCore Official Sites

Declarative sites authored with the same pages, integrations, Blocs, bindings,
and theme resources that CmsCore exposes to its users.

## Sites

- `cms-repository-hub` is the CMS-authored public catalogue for the external
  global integration repository. A designated CMS renders the site, reads the
  anonymous same-origin repository facade, and keeps all browser state in query
  parameters; it does not manage repository mutations.

## Authoring And Deployment

Each site directory is a regular `p9r` project. From that directory, update its
code-managed Blocs first, then deploy the complete `site/` tree. Before either
command, publish every pinned integration version that is not part of the
historical repository bootstrap. For `cms-repository-hub`, this currently means
publishing the checked-in official releases so that
`documentation-blocs@1.0.0` exists in the registry.

```bash
p9r push --type=blocs --force --dry-run
p9r push --type=blocs --force --yes
p9r push --dry-run
p9r push --yes
```

The targeted force is required because a normal push deliberately skips an
existing code-managed Bloc; it does not bypass remote ownership. The full push
then installs pinned integrations before publishing pages without forcing their
rerun. Deployment credentials and the target CMS Control URL are supplied to
the CLI; they are never stored here.

The production target must be the designated repository hub CMS, because only
that instance enables the enriched catalogue projection consumed by the page.
The runtime does not generate a fallback catalogue page, so this site must be
deployed before `/integrations` is announced publicly. The
current clean-clone `p9r dev` and `p9r preview` composition does not provide that
projection or materialize imported integration Blocs automatically; use a
deployed CMS preview until that development composition is added.

The repository hub pins the existing `basic-blocs@1.0.0` and
`documentation-blocs@1.0.0` integrations. Its catalogue endpoint is provided
by the repository surface, not by a site-specific integration.

Repository-specific presentation lives in the small code-managed Blocs under
`site/blocs/Repository/`. The site deliberately has no legacy `theme.css`;
global colors, type, and spacing come from the CMS structured theme.
