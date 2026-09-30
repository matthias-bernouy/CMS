# Workspace Package Map

This inventory follows the package manifests under `packages/`. Public APIs are
the exact exports declared in each `package.json`; package-local `AGENTS.md`
files explain implementation invariants.

## Foundation

| Package | Responsibility |
| --- | --- |
| `@bernouy/components` | Public custom elements, base components and declarative data binding. |
| `@bernouy/http-runner` | Runner abstractions, Bun HTTP serving, cache, compression, CSP and test helpers. |
| `@bernouy/envelope-crypto` | Envelope encryption, KEK/DEK contracts and Mongo DEK storage. |
| `@bernouy/rate-limiter` | Fixed-window rate limiting with memory and Mongo implementations. |
| `@bernouy/secret-store` | Secret storage, reference resolution and encrypted Mongo persistence. |
| `@bernouy/image-processing` | Generic image inspection and WebP transforms; its optional Sharp adapter serves author files and gateway media. |

## Features

| Package | Responsibility |
| --- | --- |
| `@bernouy/cms-content` | Pages, routes, Blocs, settings, themes, editor contracts and the author file library. |
| `@bernouy/cms-repository` | Contract releases, provider manifests, site installations/selections, catalogues and authored collection admission. |
| `@bernouy/cms-gateway` | Authorized capability invocation, provider identity aliases, file reads and image derivatives. |
| `@bernouy/cms-auth` | Accounts, local/OIDC providers, PATs, signed sessions, public auth operations and email composition. |
| `@bernouy/cms-analytics` | Server-side events, counters, persistence and dashboard HTTP handlers. |
| `@bernouy/cms-dashboards` | Transitional dashboard-to-subject assignment persistence only. |
| `@bernouy/cms-bloc-compile` | Existing Bloc validation, view/editor bundling and shared editor externals. |
| `@bernouy/cms-editor-system-v2` | Editor shell components and runtime types. |

`cms-dashboards` does not currently own dashboard definitions, widget execution
or dashboard CRUD. Collection-owned views/dashboard templates remain future
work. `cms-bloc-compile` remains a separate feature package.

The old `cms-sources`, `cms-source-images`, `cms-identities` and `cms-secrets`
packages are absent. Provider invocation, identities and media belong to
Gateway; generic secret storage and image processing belong to Foundation.
The `cms-source` HTML attribute remains the active binding API.

## Resources

`@bernouy/collection-examples` contains a checkout composition and its JSON
translation catalogue, covered by admission tests. It has no runtime
adapters or routes. There is no `packages/resources/sites` template catalogue.

## Surfaces And Runtimes

| Package | Responsibility |
| --- | --- |
| `@bernouy/cms-control` | Authenticated admin UI, REST API, editor, author media and selected gateway capability access. |
| `@bernouy/cms-delivery` | Public pages, Bloc assets, binding runtime, auth, media, gateway calls, SEO and analytics collection. |
| `@bernouy/cms-server` | Production adapter composition and Control/Delivery startup. |
| `@bernouy/ulvia-cli` | Persistent local CMS development stack backed by MongoDB. |

See [workspace architecture](README.md) for dependency direction and
[repository and gateway flows](../providers/README.md) for runtime wiring.
