# CmsCore — Bernouy CMS platform

Bun + TypeScript monorepo (`@bernouy/cms-workspace`). Reusable CMS packages are
organized in five layers with a one-way dependency rule:

> **runtimes → surfaces → features → platform → foundation**

- **foundation/** — generic, zero CMS knowledge; a non-CMS product could use
  these as-is (no `cms-` prefix).
- **platform/** — contract language, Provider models, generic execution and the SDK.
- **features/** — reusable CMS domain modules with explicit ownership. Packages
  expose adapter-light roots and declare optional persistence, HTTP, browser or
  tooling subpaths explicitly in their export maps.
- **surfaces/** — mountable HTTP modules: define behavior, decide nothing
  (everything injected; no `process.env`, no `listen`).
- **runtimes/** — executables: read env, pick adapters, mount surfaces, listen.

Direct products that are not reusable CMS layers live under `packages/`.
Official contracts and the Provider manifest are generated from SDK features.
Collections are authored and published explicitly; no starter collection or
administration Page corpus is bundled.

## Install Ulvia

The [installation guide](docs/installation/README.md) covers Ubuntu prerequisites,
the first local instance, public domains and HTTPS, upgrades, backups, and
troubleshooting. The released CLI is installed with:

```bash
bun add --global @cyaxis/ulvia@latest
ulvia start --domain control.localhost
ulvia services status
```

Stable releases use the npm `latest` tag. An explicitly tested prerelease may
instead be installed through `next`. Workspace contributors can run the same
CLI through the development commands below.

Use a CLI and images supporting shared hosting (`io.ulvia.hosting-api=1`); this
flow requires fresh installation state. Control is created automatically. Read
its protected initial administrator file, open `http://control.localhost/.cms/setup`,
and create sites through its admitted Hosting API. Source startup requires an
explicit compatible image version; see the development guide.

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
|   |   |-- resource-identity/ @bernouy/resource-identity
|   |   |-- zip/               @bernouy/zip
|   |   |-- rate-limiter/      @bernouy/rate-limiter
|   |   |-- image-processing/  @bernouy/image-processing
|   |   |-- secret-store/      @bernouy/secret-store
|   |   |-- text-search/       @bernouy/text-search
|   |   `-- text-embeddings/   @bernouy/text-embeddings
|   |-- platform/
|   |   |-- contracts/         @bernouy/ulvia-contracts
|   |   |-- providers/         @bernouy/ulvia-providers
|   |   |-- gateway/           @bernouy/cms-gateway
|   |   `-- sdk/               @bernouy/ulvia-sdk
|   |-- features/
|   |   |-- content/           @bernouy/content (pages, blocs, settings, themes, SEO)
|   |   |-- auth/              @bernouy/auth
|   |   |-- documentation/     @bernouy/documentation
|   |   |-- observability/     @bernouy/observability
|   |   |-- email/
|   |   |   |-- base/          @bernouy/email
|   |   |   `-- smtp/          @bernouy/email-smtp
|   |   |-- files/             @bernouy/files
|   |   |-- repository/        @bernouy/repository (including collection build tooling)
|   |   `-- secrets/           @bernouy/secrets
|   |-- surfaces/
|   |   |-- ulvia-provider/    @bernouy/ulvia-provider
|   |   `-- cms-edge/          @bernouy/cms-edge
|   `-- runtimes/
|       |-- ulvia-cli/         @bernouy/ulvia-cli
|       |-- cms-edge-server/   @bernouy/cms-edge-server
|       `-- ulvia-provider-server/
|
|-- infra/
|   |-- cli/                Bundled npm CLI releases
|   |-- images/             Separate Edge and Provider images
|   |-- models/             Pinned local embedding model
|   |-- operations/         Optional host maintenance
|   |-- releases/           Trusted SDK release entry
|   |-- bootstrap.ts        Offline system artifact generation
|   `-- execution-support.ts Exact executable contract pins
|
|-- build.ts
|-- tsconfig.base.json
|-- tsconfig.json
`-- package.json
```

## Dependency rules

- One direction only: `runtimes → surfaces → features → platform → foundation`. Never
  upward, never surface→surface (compose through features).
- Lateral feature→feature edges are allowed when one feature consumes
  another's published contract (e.g. email-smtp → email for outbound
  delivery). Features may consume generic Foundation contracts such as
  `@bernouy/secret-store` for `SecretReader`.
- Network adapters are only imported by runtimes (`./mongo`, `./s3`
  subpaths); surfaces consume contracts and receive instances injected.
- Features may define HTTP values (handlers, registrars under `src/http/`)
  but never hold a runner, read env, or pick their own guards — surfaces and
  runtimes decide the composition.
- Domain errors remain feature-owned. Surface adapters map them to declared
  capability failures and HTTP outcomes; features never depend on surface errors.

## Working in the workspace

```bash
bun install --frozen-lockfile # links workspace packages + installs locked externals
bun run build               # types, browser runtimes and official bootstrap
bun run check               # all static diagnostics, including types
bun run clean               # cleans TypeScript state, package dist and tsbuildinfo
bun run test                # maintained workspace tests
bun run verify              # checks, tests, static performance guards, browser and TLS
bun run perf --list         # list exact performance scenario IDs without Docker
bun run perf                # measured performance campaign and budgets
bun run perf --scenario <id> # measure only the selected scenario
```

The source CLI has no embedded initial image version. On an empty installation,
use `bun run ulvia -- apply --version <published-stack-version>`, then
create logical sites through Control. Later starts reuse persisted image digests. Running
from source does not build or deploy the current workspace's server code.

See the [development guide](docs/development/README.md) for current checks and
the [documentation index](docs/README.md) for architecture and product boundaries.

`build.ts` first prepares the admitted system API snapshot and runtime metadata
from SDK feature definitions, then runs `tsc --build` and builds the Bloc behavior
and binding-core runtimes owned by `@bernouy/content`. There is no
separate visual-component package or generated component distribution.

Packages ship **source** through their `exports` fields; consumers resolve
straight to `src/` outside the explicit `content` browser bundles.

## Deployment

`infra/images/` ships distinct Edge and Provider images. A Repository runs as
an explicitly enabled Registry on these same images, with ordinary accounts
and account-owned namespaces; see the [Repository setup](docs/installation/README.md#7-publish-to-a-repository).
The Provider boots from exact admitted resources bundled in its image, without
a running Repository. Remote discovery and publication use the separately
configured Repository connection; creating a Registry instance does not replace it.
The Ulvia CLI owns one parameterized Compose definition for loopback and public
installations. The design hosts **many instances on one server**: durable
instance data and files remain behind the Provider, while domains select logical
tenants on a shared Edge pool. Creating a site starts no process. Fresh instances start with zero Pages
and collections; native initialization lives at `/.cms/setup`. Network binding,
ports and ACME TLS are persisted installation configuration rather than a
runtime development/production switch.

## License

MIT — see [`LICENSE`](./LICENSE).
