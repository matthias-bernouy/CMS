# CmsCore — Bernouy CMS platform

Bun + TypeScript monorepo (`@bernouy/cms-workspace`). Reusable CMS packages are
organized in four layers with a one-way dependency rule:

> **runtimes → surfaces → features → foundation**

- **foundation/** — generic, zero CMS knowledge; a non-CMS product could use
  these as-is (no `cms-` prefix).
- **features/** — reusable CMS domain modules with explicit ownership. Packages
  expose adapter-light roots and declare optional persistence, HTTP, browser or
  tooling subpaths explicitly in their export maps.
- **surfaces/** — mountable HTTP modules: define behavior, decide nothing
  (everything injected; no `process.env`, no `listen`).
- **runtimes/** — executables: read env, pick adapters, mount surfaces, listen.

Direct products that are not reusable CMS layers live under `packages/`.
`official-repository` contains authored immutable releases and never mounts
routes or chooses runtime adapters.

## Install Ulvia

The [installation guide](docs/installation/README.md) covers Ubuntu prerequisites,
the first local instance, public domains and HTTPS, upgrades, backups, and
troubleshooting. The released CLI is installed with:

```bash
bun add --global @cyaxis/ulvia@latest
ulvia services start
ulvia instance create my-site
ulvia instance credentials my-site
```

Stable releases use the npm `latest` tag. An explicitly tested prerelease may
instead be installed through `next`. Workspace contributors can run the same
CLI through the development commands below.

## Layout

```
CmsCore/
|-- packages/
|   |-- foundation/
|   |   |-- binary-media/      @bernouy/binary-media
|   |   |-- blob-store/        @bernouy/blob-store
|   |   |-- http-runner/       @bernouy/http-runner
|   |   |-- envelope-crypto/   @bernouy/envelope-crypto
|   |   |-- logging/           @bernouy/logging
|   |   |-- rate-limiter/      @bernouy/rate-limiter
|   |   |-- image-processing/  @bernouy/image-processing
|   |   `-- secret-store/      @bernouy/secret-store
|   |-- features/
|   |   |-- cms-content/       @bernouy/cms-content (pages, blocs, settings, themes, SEO)
|   |   |-- cms-auth/          @bernouy/cms-auth
|   |   |-- cms-files/         @bernouy/cms-files
|   |   |-- cms-gateway/       @bernouy/cms-gateway
|   |   |-- cms-repository/    @bernouy/cms-repository (including collection build tooling)
|   |   `-- cms-secrets/       @bernouy/cms-secrets
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
|   `-- images/             Separate Kernel, Provider and Repository images
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
bun run build               # types, browser runtimes and official bootstrap
bun run typecheck           # tsc --build only (project references)
bun run clean               # cleans TypeScript state, package dist and tsbuildinfo
bun test                    # workspace test runner
```

`build.ts` first runs `tsc --build`, then builds the generated Bloc behavior and
binding-core runtimes owned by `@bernouy/cms-content`, and finally refreshes the
CLI's admitted official bootstrap snapshot. There is no separate visual-component
package or generated component distribution.

Packages ship **source** through their `exports` fields; consumers resolve
straight to `src/` outside the explicit `cms-content` browser bundles.

## Deployment

`infra/images/` ships distinct Kernel, Provider and Official Repository images.
The Ulvia CLI owns one parameterized Compose definition for loopback and public
installations. The design hosts **many instances on one server**: durable
instance data and files remain behind the Provider, while each domain routes
published and administrative Pages to its own Kernel process. Network binding,
ports and ACME TLS are persisted installation configuration rather than a
runtime development/production switch.

## License

MIT — see [`LICENSE`](./LICENSE).
