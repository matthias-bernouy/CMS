# Import Rules

Imports are part of the package architecture. They must preserve workspace
boundaries and keep browser/server/adapters separated.

## Workspace Packages

Import another package only through its declared package name or subpath:

```ts
import { ValidatingCmsRepository } from "@bernouy/cms-content";
import { MongoCmsRepository } from "@bernouy/cms-content/mongo";
```

Do not import another package through a deep filesystem path:

```ts
// Wrong
import { MongoCmsRepository } from "../../cms-content/src/default-implementation/MongoCmsRepository";
```

If a symbol must be consumed by another package, export it from the owning
package's `src/exports/*.ts` file and declare the matching subpath in
`package.json`.

## Local Package Aliases

Inside a package, use the package-local path aliases already configured for
that package:

```ts
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import { validatePagePath } from "cms-content/core/validation/pages";
import { BunRunner } from "http-runner/default-implementation/BunRunner";
```

Avoid deep `../../..` imports when a local alias exists. A short relative import
between sibling files is acceptable when that is the package's established
style, but do not cross package boundaries with relative paths.

## Adapter Subpaths

Adapter subpaths isolate optional infrastructure:

- `./mongo` imports MongoDB-backed repositories.
- `./s3` imports S3-backed file blobs.
- `./browser` imports browser-safe source types and helpers.
- `./components` imports browser components for auth.

Only composition roots should import production adapters. In practice this
usually means `@bernouy/cms-server`, tests, or local development wiring.
Surfaces consume interfaces and receive concrete instances through their
constructors or config.

## Browser Bundles

Browser-facing code must not import Node, Bun server APIs, Mongo adapters, S3
adapters, or surface internals. Use browser-safe subpaths such as:

```ts
import { Component } from "@bernouy/cms-control/component";
import { Editor } from "@bernouy/cms-control/editor";
import type { EndpointPickerMethod } from "@bernouy/cms-content/editor";
```

For bloc editor bundles, `@bernouy/cms-control/editor` is rewritten by
`p9rExternalsPlugin` so the runtime reads from `window.p9rEditor`.

## Path Resolution

Do not build package-root paths with `__dirname` and fragile `../../`
navigation. Prefer `import.meta.dir`, package-local constants, or an injected
root path. This matters for Bun, ESM, built artifacts, and packaged templates.
