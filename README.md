# CmsCore — Bernouy CMS platform

Bun + TypeScript monorepo (`@bernouy/cms-core`). Packages are organized in
four layers with a one-way dependency rule:

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

## Layout

```
CmsCore/
├── packages/
│   ├── foundation/
│   │   ├── http-runner/       @bernouy/http-runner     Runner contract + BunRunner + HTTP toolkit (Cache/TtlCache, compression, CSP, html helpers — `./html` is browser-safe) + serveForTest under ./testing
│   │   ├── envelope-crypto/   @bernouy/envelope-crypto envelope encryption (DEK/KEK, EnvelopeSecretCrypto) + queryable field encryption (FieldCrypto, blind index); ./mongo = MongoDekRepository + createFieldCrypto
│   │   └── rate-limiter/      @bernouy/rate-limiter    fixed-window rate limiting; ./mongo = cross-instance counter
│   ├── features/
│   │   ├── cms-content/       @bernouy/cms-content     the content aggregate behind CmsRepository — pages, blocs, templates, snippets, settings (one interface file per entity) + ContentReader read view + expandSnippets/contentRefs/hardenStoredHtml/roles rules + p9r constants; ./mongo
│   │   ├── cms-files/         @bernouy/cms-files       media files — metadata + blob contracts, file lifecycle (upload/update/delete), sharp image variants + optimize queue, /.cms/files + image-variant endpoints; ./mongo, ./s3
│   │   ├── cms-secrets/       @bernouy/cms-secrets     admin-managed secrets — SecretStore/SecretReader, ${VAR} resolution, gateway secret resolver; ./mongo = envelope-encrypted store
│   │   ├── cms-permissions/   @bernouy/cms-permissions roles & permissions vocabulary (urn catalogue, grants, can()) — dependency-free
│   │   ├── cms-auth/          @bernouy/cms-auth        CMS-owned auth chain — LocalAuth + dynamic OIDC + PATs + signed cookies + Users/IdP/Credential stores + registerAuthRoutes/authGuard/login pages; ./mongo, ./components
│   │   ├── cms-gateway/       @bernouy/cms-gateway     data-gateway substrate — providers/endpoints, request resolution + execution, OpenAPI spec machinery; ./presets
│   │   ├── cms-analytics/     @bernouy/cms-analytics   cookieless server-side analytics — collection (buildPageViewEvent) + counters-at-write store + dashboard API registrar
│   │   ├── cms-blocs/         @bernouy/cms-blocs       UI toolkit (`<p9r-*>`, `<w13c-*>`) + data-binding runtime. Published to npm (MIT).
│   │   └── cms-bloc-compile/  @bernouy/cms-bloc-compile bloc build pipeline (prepare_bloc, validateBloc, p9rExternalsPlugin)
│   ├── surfaces/
│   │   ├── cms-control/       @bernouy/cms-control     admin — REST API (/api), admin pages (/admin), the visual editor; ControlCms mounts it all on an injected runner
│   │   └── cms-delivery/      @bernouy/cms-delivery    public rendering — DeliveryCms: page render pipeline, signature-grouped bloc bundles, theme, sitemap/robots
│   └── runtimes/
│       ├── cms-cli/           @bernouy/cms-cli         `p9r` CLI — scaffold blocs/apps, local editor (p9r dev), push/pull content
│       └── cms-server/        @bernouy/cms-server      production composition root — Mongo + FS stores, crypto, auth; Control + Delivery on two ports. The only place reading process.env.
│
├── infra/
│   └── images/cms/            Docker image (Dockerfile runs cms-server) + per-instance compose + shared nginx-proxy/acme/mongo compose. Multi-instance per server.
│
├── build.ts                   orchestrated build (see below)
├── tsconfig.base.json         shared TS compilerOptions
├── tsconfig.json              `references` to every package (project refs)
└── package.json               workspaces: packages/{foundation,features,surfaces,runtimes}/*
```

## Dependency rules

- One direction only: `runtimes → surfaces → features → foundation`. Never
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
bun run build               # orchestrated: cms-blocs bundle → tsc --build → cms-control bundle
bun run typecheck           # tsc --build only (project references)
bun run clean               # tsc --build --clean (drops per-package dist + tsbuildinfo)
bun test                    # workspace test runner
```

`build.ts` is sequenced because downstream packages need upstream artefacts
at type-check time:

1. `packages/features/cms-blocs` → `dist/{ui.js, style.css, index.d.ts, blocs/*.d.ts}`.
   `cms-blocs` ships its built bundle as `main`; consumers import the IIFE
   bundle to register every tag at once, so it must build first.
2. `tsc --build` → emits `.d.ts` for every other package via project refs.
3. `packages/surfaces/cms-control` → control-side prebuild
   (`control-components.js` bundle, depends on `cms-blocs/dist`) + own `.d.ts` emit.

Every other package ships **source** through its `exports` field — no bundle
step, consumers resolve straight to `src/`.

## Deployment

`infra/images/cms/` ships the deployment artefact: a `Dockerfile` (runs
`packages/runtimes/cms-server`), a per-instance `compose.yml`, and a shared
`infra/compose.yml` (`nginx-proxy` + `acme-companion` + `mongo`). The design
hosts **many instances on one server** sharing one nginx + one Mongo, each
instance routed by domain via `VIRTUAL_HOST_MULTIPORTS` (`DOMAIN` for
Delivery, `admin.DOMAIN` for Control). Content / users / secrets live in
MongoDB; file blobs (and generated image variants) in a per-instance folder.
See [`infra/images/cms/README.md`](./infra/images/cms/README.md) for the
quick start.

## License

MIT — see [`LICENSE`](./LICENSE).
