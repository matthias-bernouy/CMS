# Develop, Validate, And Publish

The CLI has no Bloc scaffolding command. Add the Bloc to a collection source,
declare it as a selectable resource, then use the local stack and release audit
as the contract test.

## Local Loop

```bash
bun run ulvia -- dev
```

`ulvia dev` runs a persistent local CMS, repository, MongoDB, and Supabase
stack. Release the collection locally, install it in that CMS, and test all of
the following before publishing:

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

Run the repeatable source and upgrade checks separately:

```bash
bun run ulvia -- audit example-collection
```

The audit builds the canonical package, runs collection-owned tests, verifies a
fresh installation, and exercises every supported upgrade baseline in
disposable services. It does not write a release.

## Validation Rules

A custom tag must be lowercase, contain a hyphen, and avoid the reserved
`p9r-`, `w13c-`, `be5-`, and `cms-` prefixes. The validator also rejects
malformed names, conflicting registrations, duplicate registration, and direct
`location` navigation mutations. Every native HTML root is platform-owned and
is rejected as an integration artifact, whether or not a legacy manifest marks
it as native.

Before handoff, verify that:

- the immediate parent directory is the intended catalogue group;
- every manifest path exists and remains inside the Bloc directory;
- `default-tag` matches the root tag in `default.html`;
- the resource ID and tag use the collection kind namespaces
  (`<kind>/blocs/*` and `<kind>-*`) and the tag is not native HTML;
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

## Release, Publish, And Pull

Store a candidate locally only after its complete audit passes:

```bash
bun run ulvia -- release example-collection
```

Publication submits immutable local releases to the remote repository, whose
admission service runs its own verification before exposing package bytes:

```bash
bun run ulvia -- push example-collection
```

Existing coordinates are immutable. Change the collection version whenever its
package bytes change; there is no force flag that overwrites a published
coordinate.

Materialize remote immutable packages in the persistent local repository with:

```bash
bun run ulvia -- pull example-collection --all-versions
```

`pull` stores packaged baselines for audits and installations. Authoring source
continues to live in the collection directory and is never reconstructed from a
runtime package.

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
