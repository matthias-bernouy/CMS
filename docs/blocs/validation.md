# Develop, Validate, And Publish

The CLI has no Bloc scaffolding command. Create the group and Bloc directories
manually, then use the local runtime as the contract test.

## Local Loop

Configure the one required public integration repository in the project `.env`
or process environment before starting either local runtime:

```dotenv
P9R_INTEGRATION_REPOSITORY_URL=https://repository.example.com/.cms/repository
```

```bash
p9r dev
```

`p9r dev` runs the local editor, watches site resources, and builds authored
blocs for browser execution. Test all of the following before publishing:

- insert the Bloc from its expected catalogue group;
- save, reload, duplicate, move, and delete it;
- change every setting and confirm the saved HTML attributes;
- insert valid slot content and attempt invalid content or cardinality;
- exercise loading, loaded, empty, and error Source states;
- disconnect and reconnect interactive instances to detect duplicate listeners;
- check keyboard navigation, focus visibility, accessible names, and reduced
  motion;
- check narrow and wide containers, light and dark theme values, and missing
  optional content;
- inspect image requests when the Bloc renders CMS images.

Then exercise production-like local assembly:

```bash
p9r preview
```

Preview enables production caching, minification, and security headers while
remaining a local development runtime. It must not be exposed as production.

## Validation Rules

A custom tag must be lowercase, contain a hyphen, and avoid the reserved
`p9r-`, `w13c-`, `be5-`, and `cms-` prefixes. The validator also rejects
malformed names, conflicting registrations, duplicate registration, and direct
`location` navigation mutations.

Before handoff, verify that:

- the immediate parent directory is the intended catalogue group;
- every manifest path exists and remains inside the Bloc directory;
- `default-tag` matches the root tag in `default.html`;
- `Bloc.ts` exports one browser-safe runtime class and does not self-register;
- `BlocEditor.ts`, when present, imports from `@bernouy/cms-content/editor`,
  exports one editor class, and does not self-register;
- `template.html` contains structure and empty slots while `default.html`
  contains initial authored Light DOM;
- the absent-attribute runtime state matches every editor `defaultValue`;
- essential behavior works without the editor bundle;
- CMS data uses declarative bindings rather than a parallel fetch lifecycle;
- CSS consumes theme tokens with fallbacks and exposes only intentional public
  custom properties and parts.

When contributing Bloc code inside CmsCore itself, also run the repository
checks from the workspace root:

```bash
bun run format
bun run check:all
```

Inspect formatter changes before committing. Add focused tests for behavior,
editor contracts, cleanup, bindings, accessibility, and resource compilation.

## Publish And Pull

Inspect the remote change first:

```bash
p9r push --type=blocs --dry-run
```

Publish all blocs or a selected set:

```bash
p9r push --type=blocs
p9r push --type=blocs --only=site-card,site-label
```

The command asks for confirmation unless `--yes` is supplied. Existing remote
tags are conflict-protected; `--force` bypasses conflict and cross-reference
validation and should be an explicit decision, not the default workflow.

Materialize remote sources locally with:

```bash
p9r pull --type=blocs
```

Pull can reconstruct a Bloc only when its published record includes the source
bundle.

## Delivery Model

Control loads view and editor bundles. Delivery loads view code only for Bloc
tags found in the page and for dependencies found transitively in their
templates. View sets are content-addressed and cached.

Consequently:

- never make rendering depend on `BlocEditor.ts`;
- keep a view deterministic and safe to execute once with other view bundles;
- express child Bloc dependencies in authored or template markup instead of
  creating an otherwise invisible tag name only from runtime JavaScript;
- do not depend on every installed Bloc being loaded globally.

The published source bundle exists for validation and round trips. Delivery
executes the compiled view bundle, not the TypeScript source directory.
