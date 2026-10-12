# CmsCore — Bernouy CMS platform

Bun + TypeScript monorepo (`@bernouy/cms-workspace`). Reusable CMS packages are
organized in four layers with a one-way dependency rule:

> **runtimes → surfaces → features → foundation**

- **foundation/** — generic, zero CMS knowledge; a non-CMS product could use
  these as-is (no `cms-` prefix).
- **features/** — the CMS domain, one package per persistence seam. Each
  exports contracts + dependency-free implementations from its root, network
  adapters under `./mongo` / `./s3` subpaths, and its mountable HTTP values
  (handlers, registrars, middlewares, page renderers) under `src/http/`.
- **surfaces/** — mountable HTTP modules: define behavior, decide nothing
  (everything injected; no `process.env`, no `listen`).
- **runtimes/** — executables: read env, pick adapters, mount surfaces, listen.

Direct products that are not reusable CMS layers live under `packages/`.
`official-repository` contains authored immutable releases and never mounts
routes or chooses runtime adapters.

## Layout

```
CmsCore/
|-- packages/
|   |-- foundation/
|   |   |-- binary-media/      @bernouy/binary-media
|   |   |-- blob-store/        @bernouy/blob-store
|   |   |-- http-runner/       @bernouy/http-runner
|   |   |-- envelope-crypto/   @bernouy/envelope-crypto
|   |   |-- rate-limiter/      @bernouy/rate-limiter
|   |   |-- image-processing/  @bernouy/image-processing
|   |   `-- secret-store/      @bernouy/secret-store
|   |-- features/
|   |   |-- cms-content/       @bernouy/cms-content (pages, blocs, settings, themes)
|   |   |-- cms-auth/          @bernouy/cms-auth
|   |   |-- cms-files/         @bernouy/cms-files
|   |   |-- cms-gateway/       @bernouy/cms-gateway
|   |   |-- cms-repository/    @bernouy/cms-repository (including collection build tooling)
|   |   `-- cms-seo/           @bernouy/cms-seo
|   |-- surfaces/
|   |   |-- ulvia-provider/    @bernouy/ulvia-provider
|   |   `-- cms-kernel/        @bernouy/cms-kernel
|   |-- runtimes/
|   |   |-- ulvia-cli/         @bernouy/ulvia-cli
|   |   |-- cms-kernel-server/ @bernouy/cms-kernel-server
|   |   |-- ulvia-provider-server/
|   |   `-- official-repository-server/
|   `-- official-repository/   Authored official releases
|
|-- infra/
|   `-- images/cms/
|
|-- build.ts
|-- tsconfig.base.json
|-- tsconfig.json
`-- package.json
```

## Dependency rules

- One direction only: `runtimes → surfaces → features → foundation`. Never
  upward, never surface→surface (compose through features).
- Lateral feature→feature edges are allowed when one feature consumes
  another's published contract (e.g. cms-gateway → cms-repository for selected
  capabilities). Features may consume generic Foundation contracts such as
  `@bernouy/secret-store` for `SecretReader`.
- Network adapters are only imported by runtimes (`./mongo`, `./s3`
  subpaths); surfaces consume contracts and receive instances injected.
- Features may define HTTP values (handlers, registrars under `src/http/`)
  but never hold a runner, read env, or pick their own guards — surfaces and
  runtimes decide the composition.
- Domain errors thrown by features carry a `.status` (e.g.
  `ContentValidationError` → 400); surfaces never lend their error classes
  downward.

## Working in the workspace

```bash
bun install                 # links every workspace package + installs externals
bun run build               # orchestrated: tsc --build -> cms-kernel browser bundle
bun run typecheck           # tsc --build only (project references)
bun run clean               # tsc --build --clean (drops per-package dist + tsbuildinfo)
bun test                    # workspace test runner
```

`build.ts` first runs `tsc --build`, then builds the Kernel Admin asset from the
live `@bernouy/cms-content/browser` entry. There is no separate visual-component
package or generated component distribution.

Packages ship **source** through their `exports` fields; consumers resolve
straight to `src/` outside the explicit Kernel browser bundle.

## Deployment

`infra/images/cms/` ships the deployment artefact: a `Dockerfile` containing
the two independent server entrypoints, a per-instance `compose.yml`, and a shared
`infra/compose.yml` (`nginx-proxy` + `acme-companion` + `mongo`). The design hosts
**many instances on one server** sharing the TLS proxy and one authenticated
MongoDB server. Every instance selects a dedicated database and owns its file
directory; the current shared application credential is not a database-level
security boundary. One domain routes both published and administrative Pages to
the Kernel.
See [`infra/images/cms/README.md`](./infra/images/cms/README.md) for the
quick start.

## License

MIT — see [`LICENSE`](./LICENSE).
