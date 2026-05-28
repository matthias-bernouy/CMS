# Socle — Bernouy CMS platform

Bun + TypeScript monorepo (`@bernouy/socle-monorepo`) bundling the
infrastructure contracts, the CMS (single- and multi-tenant), the admin
Web Components, and the deployment artefacts that run them on bare VPS.

## Layout

```
CmsCore/
├── packages/                         # workspace members
│   ├── core/                         @bernouy/core            interfaces (Runner, Authentication, Mailer, CDN) + serve helpers + envelope crypto
│   ├── runner-bun/                   @bernouy/runner-bun      Runner backed by `Bun.serve`
│   ├── auth-core/                    @bernouy/auth-core       CMS-owned auth primitives (LocalAuth + OidcAuth + PATs + signed cookies + Users / IdP / Credential / RateLimiter stores) + login / forbidden page renderers + authGuard
│   ├── mailer-smtp/                  @bernouy/mailer-smtp     Mailer over `nodemailer`
│   ├── webcomponents/                @bernouy/webcomponents   admin UI toolkit (`<w13c-*>`, `<p9r-*>`), built bundle + style.css
│   ├── cms/                          @bernouy/cms             CMS core: Control (admin + REST + visual editor), Delivery (rendering), `p9r` CLI
│   ├── cms-blocs/                    @bernouy/cms-blocs       library of reusable blocs (action / content / form / header / layout / navigation / …)
│   ├── cms-control-mt/               @bernouy/mt-cms-control  multi-tenant wrapper around Control (superadmin + per-tenant mounting)
│   ├── hub-api/                      @bernouy/hub-api         public REST surface bridging consumers to tenant provisioning (zod + OpenAPI)
│   └── hub-ui/                       @bernouy/hub-ui          superadmin UI for hub-api (HTML + webcomponents)
│
├── official-tenant-provisioners/     # the conforming TPs shipped with the platform
│   ├── _sdk/                         @bernouy/tenant-provisioner-sdk
│   ├── _issuer-kit/                  @bernouy/issuer-kit       sign side of the hub↔TP JWT contract
│   ├── _tenant-provisioner-contract/ wire types shared by sign + verify sides
│   ├── _example/                     toy TP — exercises the full lifecycle
│   ├── addresses/                    French BAN address autocomplete (stateless consumption TP)
│   └── cms-control/                  conformance shell over `@bernouy/mt-cms-control`
│
├── images/                           # deployment artefacts
│   └── cms/                          basic single-tenant CMS — one Bun process (Control + Delivery) + nginx sidecar. All in-memory. The "5-minute demo" entrypoint.
│
├── tests/                            workspace-level integration smoke tests
├── build.ts                          orchestrated build (see below)
├── tsconfig.base.json                shared TS compilerOptions
├── tsconfig.json                     `references` to every package (project refs)
└── package.json                      `workspaces: ["packages/*", "official-tenant-provisioners/*"]`
```

## Dependency graph

Workspace edges, taken from each package's `package.json`:

```
core ─┬─ runner-bun
      ├─ auth-core                  (+ jose ; peer: mongodb)
      ├─ mailer-smtp                (peer: nodemailer)
      ├─ cms ◄── webcomponents, auth-core   (deps: linkedom, playwright; peer: mongodb, typescript)
      │     ▲
      │     ├── cms-blocs
      │     │
      │     └── cms-control-mt ◄── auth-core, runner-bun
      │              ▲
      │              └── hub-api      (+ zod, @asteasolutions/zod-to-openapi, issuer-kit, contract)
      │                       ▲
      │                       └── hub-ui
      │
      └── webcomponents (no deps; consumed by cms + hub-ui)
```

Rules of thumb:
- `@bernouy/core` owns every cross-cutting `interface` + transport helpers
  (`serveApiFolder`, `serveStaticFolder`) + low-level utilities (`crypto`,
  `html`, `requestIP`, `concurrencyLimit`) + envelope encryption
  primitives (`EnvelopeSecretCrypto`, `LocalKekProvider`,
  `OvhOkmsKekProvider`).
- `@bernouy/auth-core` owns the **CMS-owned auth chain** — local provider
  (email/password) + dynamic OIDC (any IdP, configured as data) + signed
  session cookies + PAT bearers. The CMS and the hub both consume it; no
  package in this repo is tied to a specific IdP (Keycloak / Auth0 / Okta
  / Google plug in as one OIDC backend among many).
- `@bernouy/webcomponents` is the only place admin UI custom elements
  live; everything visual in `cms` + `hub-ui` consumes it.
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

Every other package (`core`, `runner-bun`, `auth-core`, `mailer-smtp`,
`cms-blocs`, `cms-*-mt`, `hub-api`, `hub-ui`) ships **source** through
its `exports` field — no bundle step, `bun link` consumers resolve
straight to `src/`.

## Deployment

`images/cms/` ships the only deployment artefact today: a `Dockerfile`, a
`compose.yml`, and a minimal `nginx.conf` that together spin up the
single-tenant CMS in two `docker compose up` commands. Everything is
in-memory — see `images/cms/README.md` for the quick start.

Multi-tenant / hub / TP deployments lived in this repo previously and were
removed during the "CmsCore" refocus; they may be brought back as separate
images later, but the goal of the basic deployment story is to stay one
image, one process, one bun, one nginx.

## License

MIT — see [`LICENSE`](./LICENSE).
