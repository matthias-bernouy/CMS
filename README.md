# Socle — Bernouy CMS & CDN platform

Bun + TypeScript monorepo (`@bernouy/socle-monorepo`) bundling the
infrastructure contracts, the CDN stack, the CMS (single- and
multi-tenant), the admin Web Components, and the deployment artefacts
that run them on bare VPS.

## Layout

```
Cms/
├── packages/                         # 14 workspace members
│   ├── core/                         @bernouy/core            interfaces (Runner, Authentication, Mailer, CDN) + serve helpers + envelope crypto
│   ├── runner-bun/                   @bernouy/runner-bun      Runner backed by `Bun.serve`
│   ├── auth-keycloak/                @bernouy/auth-keycloak   Keycloak / OIDC consumer (jose)
│   ├── auth-composite/               @bernouy/auth-composite  host-based router across multiple Authentications
│   ├── keycloak-client/              @bernouy/keycloak-client Keycloak Admin REST client
│   ├── mailer-smtp/                  @bernouy/mailer-smtp     Mailer over `nodemailer`
│   ├── cdn-buckets/                  @bernouy/cdn-buckets     bucket CDN: provider, broker, browser, Mongo repos, envelope-encrypted proxy secrets
│   ├── cdn-node/                     @bernouy/cdn-node        CDN origin/edge orchestration (edge registry, edge tokens, access metrics)
│   ├── webcomponents/                @bernouy/webcomponents   admin UI toolkit (`<w13c-*>`, `<p9r-*>`), built bundle + style.css
│   ├── cms/                          @bernouy/cms             CMS core: Control (admin + REST + visual editor), Delivery (rendering), `p9r` CLI
│   ├── cms-blocs/                    @bernouy/cms-blocs       library of reusable blocs (action / content / form / header / layout / navigation / …)
│   ├── cms-control-mt/               @bernouy/mt-cms-control  multi-tenant wrapper around Control (superadmin + per-tenant mounting)
│   ├── cms-delivery-mt/              @bernouy/cms-delivery-mt multi-tenant build-time delivery cron (renders + uploads to tenant CDN buckets)
│   └── hub-api/                      @bernouy/hub-api         public REST surface bridging consumers to CDN + tenant provisioning (zod + OpenAPI)
│
├── docker/                           # deployment artefacts
│   ├── auth/                         Keycloak self-hosted (sibling `postgres:16-alpine`)
│   ├── cdn-edge/                     public-serving CDN node (nginx + brotli + secrets-poll loop)
│   ├── cdn-node/                     CDN origin / control-plane (admin + lsyncd-over-SSH push to edges)
│   ├── cms-control-mt/               multi-tenant Control container
│   ├── cms-delivery-mt/              multi-tenant Delivery cron container
│   ├── hub-api/                      Hub REST API container
│   ├── _shared/                      `okms-fetch.sh` — OVHcloud OKMS mTLS secret pull, used by every entrypoint
│   ├── init-server.sh                fresh-VPS bootstrap (apt + Docker + ufw), `--role <auth|origin|edge|cms>`
│   └── DEPLOY.md                     end-to-end runbook across the 4 prod hosts
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
      ├─ cdn-buckets ──────────────────┐ (peer: image-size, mongodb)
      │     ▲                          │
      │     │                          │
      │     ├── cdn-node               │ (peer: mongodb)
      │     │                          │
      │     ├── cms ◄── webcomponents  │ (deps: linkedom, playwright; peer: mongodb, typescript)
      │     │     ▲                    │
      │     │     ├── cms-blocs        │
      │     │     │                    │
      │     │     └── cms-control-mt ◄─┘ ◄── auth-keycloak, auth-composite, runner-bun
      │     │              ▲
      │     │              ├── cms-delivery-mt   (peer: mongodb, playwright)
      │     │              │
      │     │              └── hub-api ◄── keycloak-client (+ zod, @asteasolutions/zod-to-openapi)
      │     │
      │     └── (cdn-buckets is also a direct dep of cms-delivery-mt and hub-api)
      │
      └── webcomponents (no deps; consumed by cdn-buckets, cdn-node, cms)
```

Rules of thumb:
- `@bernouy/core` owns every cross-cutting `interface` + transport helpers
  (`serveApiFolder`, `serveStaticFolder`) + low-level utilities (`crypto`,
  `html`, `requestIP`, `concurrencyLimit`) + envelope encryption
  primitives (`EnvelopeSecretCrypto`, `LocalKekProvider`,
  `OvhOkmsKekProvider`).
- `@bernouy/webcomponents` is the only place admin UI custom elements
  live; everything visual in `cdn-buckets`, `cdn-node` and `cms` consumes it.
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
`keycloak-client`, `cdn-buckets`, `cdn-node`, `cms-blocs`, `cms-*-mt`,
`hub-api`) ships **source** through its `exports` field — no bundle
step, `bun link` consumers resolve straight to `src/`.

## Deployment

Every `docker/<image>/` is self-contained: `Dockerfile`, `entrypoint.sh`,
nginx template (when relevant), `runtime.package.json`, and a per-image
`DEPLOY.md`. They all share `docker/_shared/okms-fetch.sh` for boot-time
secret retrieval (mTLS against an OVHcloud OKMS domain).

The cluster targets four hosts (auth, cdn-origin, cdn-edge ×N, cms);
`docker/DEPLOY.md` is the cross-cutting runbook (host roles,
boot order, OKMS provisioning, certs).

## License

MIT — see [`LICENSE`](./LICENSE).
