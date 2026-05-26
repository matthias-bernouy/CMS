# Socle — Bernouy CMS platform

Bun + TypeScript monorepo (`@bernouy/socle-monorepo`) bundling the
infrastructure contracts, the CMS (single- and multi-tenant), the admin
Web Components, and the deployment artefacts that run them on bare VPS.

## Layout

```
Cms/
├── packages/                         # 10 workspace members
│   ├── core/                         @bernouy/core            interfaces (Runner, Authentication, Mailer, CDN) + serve helpers + envelope crypto
│   ├── runner-bun/                   @bernouy/runner-bun      Runner backed by `Bun.serve`
│   ├── auth-keycloak/                @bernouy/auth-keycloak   Keycloak / OIDC consumer (jose)
│   ├── auth-composite/               @bernouy/auth-composite  host-based router across multiple Authentications
│   ├── keycloak-client/              @bernouy/keycloak-client Keycloak Admin REST client
│   ├── mailer-smtp/                  @bernouy/mailer-smtp     Mailer over `nodemailer`
│   ├── webcomponents/                @bernouy/webcomponents   admin UI toolkit (`<w13c-*>`, `<p9r-*>`), built bundle + style.css
│   ├── cms/                          @bernouy/cms             CMS core: Control (admin + REST + visual editor), Delivery (rendering), `p9r` CLI
│   ├── cms-blocs/                    @bernouy/cms-blocs       library of reusable blocs (action / content / form / header / layout / navigation / …)
│   ├── cms-control-mt/               @bernouy/mt-cms-control  multi-tenant wrapper around Control (superadmin + per-tenant mounting)
│   └── hub-api/                      @bernouy/hub-api         public REST surface bridging consumers to tenant provisioning (zod + OpenAPI)
│
├── docker/                           # deployment artefacts
│   ├── auth/                         Keycloak self-hosted (sibling `postgres:16-alpine`)
│   ├── cms-control-mt/               multi-tenant Control container
│   ├── hub-api/                      Hub REST API container
│   ├── _shared/                      `okms-fetch.sh` — OVHcloud OKMS mTLS secret pull, used by every entrypoint
│   ├── init-server.sh                fresh-VPS bootstrap (apt + Docker + ufw), `--role <auth|cms>`
│   └── DEPLOY.md                     end-to-end runbook across the prod hosts
│
├── tests/                            workspace-level integration smoke tests
├── build.ts                          orchestrated build (see below)
├── tsconfig.base.json                shared TS compilerOptions
├── tsconfig.json                     `references` to every package (project refs)
└── package.json                      `workspaces: ["packages/*"]`
```

## Dependency graph

Workspace edges, taken from each package's `package.json`:

```
core ─┬─ runner-bun
      ├─ auth-keycloak              (+ jose)
      ├─ auth-composite
      ├─ mailer-smtp                (peer: nodemailer)
      ├─ cms ◄── webcomponents      (deps: linkedom, playwright; peer: mongodb, typescript)
      │     ▲
      │     ├── cms-blocs
      │     │
      │     └── cms-control-mt ◄── auth-keycloak, auth-composite, runner-bun
      │              ▲
      │              └── hub-api ◄── keycloak-client (+ zod, @asteasolutions/zod-to-openapi)
      │
      └── webcomponents (no deps; consumed by cms)
```

Rules of thumb:
- `@bernouy/core` owns every cross-cutting `interface` + transport helpers
  (`serveApiFolder`, `serveStaticFolder`) + low-level utilities (`crypto`,
  `html`, `requestIP`, `concurrencyLimit`) + envelope encryption
  primitives (`EnvelopeSecretCrypto`, `LocalKekProvider`,
  `OvhOkmsKekProvider`).
- `@bernouy/webcomponents` is the only place admin UI custom elements
  live; everything visual in `cms` consumes it.
- The `*-mt` packages are thin wrappers that compose the single-tenant
  packages under per-tenant runner groups.

## Working in the workspace

```bash
bun install                 # links every workspace package + installs externals
bun run build               # orchestrated: webcomponents bundle → tsc --build → cms bundle
bun run typecheck           # tsc --build only (project references)
bun run clean               # tsc --build --clean (drops per-package dist + tsbuildinfo)
bun test                    # workspace test runner
```

`build.ts` is sequenced because downstream packages need upstream
artefacts at type-check time:

1. `packages/webcomponents` → `dist/{ui.js, style.css, index.d.ts, blocs/*.d.ts}`
   (`webcomponents` ships its built bundle as `main`; consumers import
   the IIFE bundle to register every tag at once).
2. `tsc --build` → emits `.d.ts` for every other package via project refs.
3. `packages/cms` → control-side prebuild + own `.d.ts` emit.

Every other package (`core`, `runner-bun`, `auth-*`, `mailer-*`,
`keycloak-client`, `cms-blocs`, `cms-*-mt`, `hub-api`) ships **source**
through its `exports` field — no bundle step, `bun link` consumers
resolve straight to `src/`.

## Deployment

Every `docker/<image>/` is self-contained: `Dockerfile`, `entrypoint.sh`,
nginx template (when relevant), `runtime.package.json`, and a per-image
`DEPLOY.md`. They all share `docker/_shared/okms-fetch.sh` for boot-time
secret retrieval (mTLS against an OVHcloud OKMS domain).

The cluster targets the auth and cms hosts; `docker/DEPLOY.md` is the
cross-cutting runbook (host roles, boot order, OKMS provisioning, certs).

## License

MIT — see [`LICENSE`](./LICENSE).
