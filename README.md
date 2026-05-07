# Socle — Bernouy infrastructure libraries

Bun + TypeScript monorepo of small composable libraries that share contracts
(`Runner`, `Authentication`, `Mailer`, `CDN`) and expose pluggable
implementations behind them. Plus a turnkey Docker image for the CDN.

## Layout

```
socle/
├── packages/                                # libraries (workspace members)
│   ├── core/                                @bernouy/core           — interfaces + serve helpers + utilities
│   ├── runner-bun/                          @bernouy/runner-bun     — Runner backed by `Bun.serve`
│   ├── auth-keycloak/                       @bernouy/auth-keycloak  — Keycloak / OIDC consumer
│   ├── auth-composite/                      @bernouy/auth-composite — host-based router across multiple auths
│   ├── mailer-smtp/                         @bernouy/mailer-smtp    — Mailer over `nodemailer`
│   └── cdn/                                 @bernouy/cdn-buckets            — single-bucket CDN provider, broker, browser
│
├── docker/                                  # deployment artefacts
│   ├── cdn/                                 base image (Bun + nginx + lego, BYO bootstrap)
│   └── cdn-keycloak/                        all-in-one image (mongo + nginx + lego + cdn + Keycloak auth)
│
├── tests/                                   # integration smoke tests against the workspace
├── tsconfig.base.json                       # shared TS compilerOptions
├── tsconfig.json                            # `references` to every package (project refs)
└── package.json                             # `workspaces: ["packages/*"]`
```

## Dependency graph

```
core ─┬─ runner-bun
      ├─ auth-{keycloak,token,composite}
      ├─ mailer-{console,smtp}
      └─ cdn
```

`@bernouy/core` owns every `interface` + a few transport helpers
(`serveApiFolder`, `serveStaticFolder`) + low-level utilities
(`crypto`, `html`, `requestIP`). Everything else depends on it and only on
it — no inter-implementation coupling.

## Working in the workspace

```bash
bun install                 # links every package + installs externals
bun run typecheck           # tsc --build (project references)
bun run build               # same as typecheck — emits dist/*.d.ts per package
bun run clean               # nukes per-package dist/ + tsbuildinfo
```

Each package's `package.json` declares `"main": "src/index.ts"` so consumers
that link via `bun link` resolve directly to source — no rebuild needed for
runtime changes.

## Documentation

- Root → packages → docs:
  - [`packages/cdn-buckets/README.md`](./packages/cdn-buckets/README.md)
  - [`packages/cdn-buckets/docs/dev/getting-started.md`](./packages/cdn-buckets/docs/dev/getting-started.md) — local dev path A (no Nginx) + path B (Nginx-enabled).
  - [`packages/cdn-buckets/docs/prod/getting-started.md`](./packages/cdn-buckets/docs/prod/getting-started.md) — production setup, lego cert orchestration.
  - [`packages/cdn-buckets/docs/tests/local-scenario.md`](./packages/cdn-buckets/docs/tests/local-scenario.md) — end-to-end runbook from a consumer package perspective.
- Per-package `README.md` for the auth / mailer / runner libs (where they
  carry one).

## License

MIT — see [`LICENSE`](./LICENSE).
