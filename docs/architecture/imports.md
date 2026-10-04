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
import { MongoCmsRepository } from "../../cms-content/src/application/default-implementation/mongo/MongoCmsRepository";
```

If a symbol must be consumed by another package, export it from the owning
package's `src/exports/*.ts` file and declare the matching subpath in
`package.json`.

## Local Package Aliases

Inside a package, use the package-local path aliases already configured for
that package:

```ts
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import { isPublishedPage } from "cms-content/pages/core/lifecycle/publication";
import { BunRunner } from "http-runner/default-implementation/BunRunner";
```

Avoid deep `../../..` imports when a local alias exists. A short relative import
between sibling files is acceptable when that is the package's established
style, but do not cross package boundaries with relative paths.

## Adapter Subpaths

Adapter subpaths isolate optional infrastructure:

- `./mongo` imports MongoDB-backed repositories.
- `@bernouy/blob-store/s3` imports the generic S3-backed blob adapter.
- `@bernouy/blob-store/local-fs` imports the generic filesystem blob adapter;
  `./files/local-fs` on `cms-content` imports filesystem-backed CMS metadata.
- `./browser` exposes browser-safe APIs where the package declares it, such as
  `cms-auth/browser`; gateway image helpers use `cms-gateway/media/browser`.

Production adapters belong in composition roots such as `@bernouy/cms-server`
and local development wiring. Tests can also compose adapters.
Surfaces consume interfaces and receive concrete instances through their
constructors or config.

## Browser Bundles

Browser-facing code must not import Node, Bun server APIs, Mongo adapters, S3
adapters, or surface internals. Use browser-safe subpaths such as:

```ts
import { Component } from "@bernouy/cms-control/component";
```

Collection authoring metadata is JSON and does not create a second browser
bundle.

## Path Resolution

Do not build package-root paths with `__dirname` and fragile `../../`
navigation. Prefer `import.meta.dir`, package-local constants, or an injected
root path. This matters for Bun, ESM, built artifacts, and packaged templates.
