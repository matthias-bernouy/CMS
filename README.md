# CmsCore — Bernouy CMS platform

Bun + TypeScript monorepo (`@bernouy/cms-core`). Packages are organized in
five layers with a one-way dependency rule:

> **runtimes → surfaces → resources → features → foundation**

- **foundation/** — generic, zero CMS knowledge; a non-CMS product could use
  these as-is (no `cms-` prefix).
- **features/** — the CMS domain, one package per persistence seam. Each
  exports contracts + dependency-free implementations from its root, network
  adapters under `./mongo` / `./s3` subpaths, and its mountable HTTP values
  (handlers, registrars, middlewares, page renderers) under `src/http/`.
- **resources/** — versioned declarative CMS resources such as official
  integration packages. They may depend on feature contracts to describe
  resources, but do not mount routes or choose runtime adapters.
- **surfaces/** — mountable HTTP modules: define behavior, decide nothing
  (everything injected; no `process.env`, no `listen`).
- **runtimes/** — executables: read env, pick adapters, mount surfaces, listen.

## Layout

```
CmsCore/
|-- packages/
|   |-- foundation/
|   |   |-- http-runner/       @bernouy/http-runner
|   |   |-- envelope-crypto/   @bernouy/envelope-crypto
|   |   |-- rate-limiter/      @bernouy/rate-limiter
|   |   `-- components/        @bernouy/components
|   |-- features/
|   |   |-- cms-content/       @bernouy/cms-content
|   |   |-- cms-files/         @bernouy/cms-files
|   |   |-- cms-secrets/       @bernouy/cms-secrets
|   |   |-- cms-permissions/   @bernouy/cms-permissions
|   |   |-- cms-auth/          @bernouy/cms-auth
|   |   |-- cms-sources/       @bernouy/cms-sources
|   |   |-- cms-integrations/  @bernouy/cms-integrations
|   |   |-- cms-analytics/     @bernouy/cms-analytics
|   |   |-- cms-bloc-compile/  @bernouy/cms-bloc-compile
|   |   `-- cms-editor-system-v2/ @bernouy/cms-editor-system-v2
|   |-- resources/
|   |   `-- official-integrations/ @bernouy/cms-official-integrations
|   |-- surfaces/
|   |   |-- cms-control/       @bernouy/cms-control
|   |   |-- cms-repository/    @bernouy/cms-repository
|   |   `-- cms-delivery/      @bernouy/cms-delivery
|   `-- runtimes/
|       |-- cms-cli/           @bernouy/cms-cli
|       `-- cms-server/        @bernouy/cms-server
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

- One direction only: `runtimes → surfaces → resources → features → foundation`. Never
  upward, never surface→surface (compose through features).
- Lateral feature→feature edges are allowed when one feature consumes
  another's contract (e.g. cms-auth → cms-secrets for `SecretReader`,
  cms-content → cms-permissions for `RolesConfig`).
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
bun run build               # orchestrated: components bundle -> tsc --build -> cms-control bundle
bun run typecheck           # tsc --build only (project references)
bun run clean               # tsc --build --clean (drops per-package dist + tsbuildinfo)
bun test                    # workspace test runner
```

`build.ts` is sequenced because downstream packages need upstream artefacts
at type-check time:

1. `packages/foundation/components` -> `dist/{index.js, style.css, index.d.ts, blocs/*.mjs, blocs/*.d.ts}`.
   `@bernouy/components` ships generated bundles and declarations; consumers
   need those artifacts before the workspace type-check runs.
2. `tsc --build` → emits `.d.ts` for every other package via project refs.
3. `packages/surfaces/cms-control` -> control-side prebuild
   (`control-components.js` bundle, depends on `@bernouy/components/dist`) + own `.d.ts` emit.

Every other package ships **source** through its `exports` field — no bundle
step, consumers resolve straight to `src/`.

## Deployment

`infra/images/cms/` ships the deployment artefact: a `Dockerfile` (runs
`packages/runtimes/cms-server`), a per-instance `compose.yml`, and a shared
`infra/compose.yml` (`nginx-proxy` + `acme-companion` + `mongo`). The design hosts
**many instances on one server** sharing the TLS proxy and one authenticated
MongoDB server. Every instance selects a dedicated database and owns its file
directory; the current shared application credential is not a database-level
security boundary. Domains are routed via `VIRTUAL_HOST_MULTIPORTS` (`DOMAIN`
for Delivery, `admin.DOMAIN` for Control).
See [`infra/images/cms/README.md`](./infra/images/cms/README.md) for the
quick start.

## License

MIT — see [`LICENSE`](./LICENSE).
