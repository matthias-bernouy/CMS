# CmsCore — Bernouy CMS platform

Bun + TypeScript monorepo (`@bernouy/cms-core`) bundling the infrastructure
contracts, the CMS split into Control (admin) + Delivery (rendering) + shared
domain, the admin UI toolkit, the `p9r` CLI, and the deployment artefacts that
run them on a bare VPS.

## Layout

```
CmsCore/
├── packages/                    # workspace members (workspaces: ["packages/*"])
│   ├── core/                    @bernouy/core         interfaces (Runner, Authentication) + serve helpers (serveApiFolder, serveStaticFolder) + signed-cookie codec + envelope crypto + low-level utilities. Browser-safe by default.
│   ├── runner-bun/              @bernouy/runner-bun   Runner contract implemented on `Bun.serve` (+ registerStaticFolder helper)
│   ├── auth-core/               @bernouy/auth-core    CMS-owned auth chain — LocalAuth + OidcAuth + PATs + signed cookies + Users / IdP / Credential / RateLimiter stores + login / forbidden page renderers + authGuard. Provider-agnostic.
│   ├── cms-shared/              @bernouy/cms-shared   CMS domain primitives shared by control + delivery + cli — content interfaces (Pages/Blocs/Templates/Snippets/Files/Secrets) + in-memory/Mongo/S3 impls + bloc compilation (prepare_bloc) + CSP/compression helpers + p9r constants
│   ├── cms-delivery/            @bernouy/cms-delivery public-facing rendering layer — `DeliveryCms` mounts page resolution, bloc bundles, theme CSS, favicon. On-demand rendering, reads a DeliveryRepository (read-only subset of CmsRepository).
│   ├── cms-control/             @bernouy/cms-control  admin layer — REST API (/api), server-rendered admin pages (/admin), visual editor (/assets), the `ControlCms` composition class
│   ├── cms-blocs/               @bernouy/cms-blocs    admin UI toolkit (`<p9r-*>`, `<w13c-*>`), built bundle + style.css. Published to npm (MIT). Consumed by cms-control.
│   └── cms-cli/                 @bernouy/cms-cli      `p9r` CLI — scaffold blocs (`p9r init`) + CMS apps (`p9r new`), run a local editor (`p9r dev`), push/pull/list content (`p9r push`/`pull`/`list-blocs`/`secrets`)
│
├── images/                      # deployment artefacts
│   └── cms/                     basic CMS image — one Bun process (Control + Delivery) + nginx-proxy + Mongo. Multi-instance per server. See images/cms/README.md.
│
├── build.ts                     orchestrated build (see below)
├── tsconfig.base.json           shared TS compilerOptions
├── tsconfig.json                `references` to every package (project refs)
└── package.json                 `workspaces: ["packages/*"]`
```

## Dependency graph

Workspace edges, taken from each package's `package.json`:

```
core ─┬─ runner-bun
      ├─ auth-core                  (+ jose ; peer: mongodb, typescript)
      ├─ cms-shared ◄── auth-core   (peer: mongodb, typescript)
      │     ▲
      │     ├── cms-delivery        (+ linkedom)
      │     └── cms-control ◄── runner-bun, auth-core, cms-blocs   (peer: mongodb, typescript)
      │              ▲
      │              └── cms-cli ◄── runner-bun, auth-core, cms-shared
      │
      └── cms-blocs (no runtime deps; published standalone; consumed by cms-control)
```

Rules of thumb:
- `@bernouy/core` owns every cross-cutting `interface` (`Runner`,
  `Authentication`) + transport helpers (`serveApiFolder`,
  `serveStaticFolder`) + the `SignedCookieCodec` + low-level utilities
  (`crypto`, `html`, `requestIP`) + envelope-encryption primitives
  (`EnvelopeSecretCrypto`, `LocalKekProvider`, `KekProvider`). Browser-safe
  except `loadKek`.
- `@bernouy/auth-core` owns the **CMS-owned auth chain** — local provider
  (email/password) + dynamic OIDC (any IdP, configured as data) + signed
  session cookies + PAT bearers + the membership / IdP / credential stores.
  No package in this repo is tied to a specific IdP — Keycloak / Auth0 /
  Okta / Google plug in as one OIDC backend among many.
- `@bernouy/cms-shared` is the single home for the content domain
  (interfaces + in-memory / Mongo / S3 implementations) plus bloc
  compilation. Both `cms-control` and `cms-delivery` consume it; pick the
  store impls that fit your deployment and pass them in.
- `@bernouy/cms-control` (admin) and `@bernouy/cms-delivery` (public) are
  separate mountables — compose them on one runner for a single process, or
  split them across processes.
- `@bernouy/cms-blocs` is the only place admin UI custom elements live;
  everything visual in `cms-control` consumes its built bundle.

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

1. `packages/cms-blocs` → `dist/{ui.js, style.css, index.d.ts, blocs/*.d.ts}`.
   `cms-blocs` ships its built bundle as `main`; consumers import the IIFE
   bundle to register every tag at once, so it must build first.
2. `tsc --build` → emits `.d.ts` for every other package via project refs.
3. `packages/cms-control` → control-side prebuild (`control-components.js`
   bundle, depends on `cms-blocs/dist`) + own `.d.ts` emit.

Every other package (`core`, `runner-bun`, `auth-core`, `cms-shared`,
`cms-delivery`, `cms-cli`) ships **source** through its `exports` field — no
bundle step, `bun link` consumers resolve straight to `src/`.

## Deployment

`images/cms/` ships the deployment artefact: a `Dockerfile`, a `server.ts`
composition (Control + Delivery on one Bun process), a per-instance
`compose.yml`, and a shared `infra/compose.yml` (`nginx-proxy` +
`acme-companion` + `mongo`). The design hosts **many instances on one
server** sharing one nginx + one Mongo, each instance routed by domain via
`VIRTUAL_HOST_MULTIPORTS` (`DOMAIN` for Delivery, `admin.DOMAIN` for
Control). Content / users / secrets live in MongoDB; file blobs in a
per-instance folder. See [`images/cms/README.md`](./images/cms/README.md) for
the quick start.

## License

MIT — see [`LICENSE`](./LICENSE).
</content>
</invoke>
