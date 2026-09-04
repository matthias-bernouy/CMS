# @bernouy/cms-control

Admin layer of the CMS — REST API, server-rendered admin pages, and the
visual editor. Mounts on a runner you provide. Runs on **Bun** and ships
as a Bun-first package — no transpile, consumers execute the TypeScript
source directly.

Pair it with:

- **`@bernouy/cms-delivery`** for the public-facing rendering layer.
- **`@bernouy/cms-content`**, **`@bernouy/cms-files`** and
  **`@bernouy/cms-secrets`** for persistence contracts and default stores.
- **`@bernouy/cms-auth`** for the auth chain (login + signed cookie +
  PATs).

A working composition of all of the above lives in `images/cms/server.ts`
at the repo root.

---

## Installation

This package lives in the `@bernouy/cms-core` monorepo as a workspace
package. External installation is not the primary distribution path
today.

---

## Mounting

`ControlCms` registers its routes on whatever runner you pass. Scope the
runner with `runner.group("/cms", …)` if you want everything under `/cms`:

```ts
import { BunRunner } from "@bernouy/http-runner";
import { InMemoryCache } from "@bernouy/http-runner";
import { ControlCms } from "@bernouy/cms-control";
import {
    InMemoryAuthentication,        // dev / harness only
    LocalAuthentication, SubjectResolver,
    InMemoryUsersRepository, InMemoryIdentityProviderRepository,
    InMemoryLocalCredentialStore, InMemoryPatRepository,
    SignedCookieCodec,
} from "@bernouy/cms-auth";
import { InMemoryRateLimiter } from "@bernouy/rate-limiter";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import { InMemoryCmsFilesMetadata, InMemoryCmsFilesBlob } from "@bernouy/cms-files";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import type { CMS_ROLES } from "@bernouy/cms-permissions";

const runner = new BunRunner();

runner.group("/cms", (sub) => {
    // Wire the auth chain. For a 5-minute demo, swap LocalAuthentication
    // for InMemoryAuthentication and skip the seeding step below.
    const codec    = new SignedCookieCodec(new TextEncoder().encode(SESSION_SECRET));
    const users    = new InMemoryUsersRepository<CMS_ROLES>();
    const pats     = new InMemoryPatRepository();
    const resolver = new SubjectResolver<CMS_ROLES>(users, "user");

    const auth = new LocalAuthentication<CMS_ROLES>({
        providerId:    "local",
        loginPagePath: "/cms/login",
        logoutPath:    "/cms/auth/logout",
        credentials:   new InMemoryLocalCredentialStore(),
        resolver, codec,
        pats,
        rateLimit:     new InMemoryRateLimiter({ limit: 8, windowSeconds: 300 }),
        cookieName:    "cms-session",
        defaultHome:   "/cms/admin/pages",
    });

    new ControlCms(sub,
        new InMemoryCmsRepository(),
        auth,
        {},
        new InMemoryCache(),
        new InMemorySecretStore(),
        new InMemoryCmsFilesMetadata(),
        new InMemoryCmsFilesBlob(),
        users,
        new InMemoryIdentityProviderRepository(),
        pats,
        undefined,
        undefined,
        undefined,
        undefined,
        { local: auth },
    );
});

runner.start(3000);
```

### Constructor signature

```ts
new ControlCms(
    runner:              Runner,
    repository:          CmsRepository,
    auth:                Authentication<CMS_ROLES>,
    options:             { publicAuth?: PublicAuthRoutesConfig<CMS_ROLES>; integrationCatalog?: IntegrationDefinitionRepository } = {},
    cache?:              Cache,
    secrets?:            SecretStore,
    filesMetadata?:      CmsFilesMetadataRepository,
    filesBlob?:          CmsFilesBlobStore,
    users?:              UsersRepository<CMS_ROLES>,
    identityProviders?:  IdentityProviderRepository,
    pats?:               PatRepository,
    credentials?:        LocalCredentialStore,
    sources?:            SourceRepository,
    analytics?:          AnalyticsStore,
    roles?:              RolesRepository,
    authBackends?:       { local?: LocalAuthentication<CMS_ROLES>; oidc?: OidcAuthentication<CMS_ROLES> },
)
```

The first three args are required. Each missing optional repo / store
silently disables the admin surface that needs it:

| Optional dep         | Disabling effect                              |
|----------------------|-----------------------------------------------|
| `cache`              | Defaults to `InMemoryCache`                   |
| `secrets`            | Defaults to `InMemorySecretStore`             |
| `filesMetadata`      | Files admin throws "not configured" on call   |
| `filesBlob`          | Files admin throws "not configured" on call   |
| `users`              | Users admin page throws "not configured"      |
| `identityProviders`  | Settings → Identity tab throws                |
| `pats`               | Profile → Tokens tab throws                   |
| `authBackends.local` | Local login/logout routes are not mounted     |
| `authBackends.oidc`  | OIDC login/callback routes are not mounted    |

### `InMemoryAuthentication` (dev only)

Use it as a drop-in `Authentication<CMS_ROLES>` when you want to skip
the login flow during local dev or in the manual test harness. It
returns a fixed `Subject` for every request — never use it in
production. Import it from `@bernouy/cms-auth`.

```ts
import { InMemoryAuthentication } from "@bernouy/cms-auth";

const auth = new InMemoryAuthentication({ role: "admin", displayName: "Ulvia local development" });
new ControlCms(sub, repo, auth, {}, …);
```

`ulvia dev` wires the complete local stack and exposes development credentials
through `ulvia dev credentials`.

---

## URLs exposed under the runner's `basePath` (e.g. `/cms`)

| Path                                     | Auth      | Purpose                                   |
|------------------------------------------|-----------|-------------------------------------------|
| `<basePath>/login`                       | public    | Standalone login page (form + OIDC list)  |
| `<basePath>/auth/methods`                | public    | JSON discovery of enabled providers       |
| `<basePath>/auth/login`                  | public    | POST credentials (local provider)         |
| `<basePath>/auth/logout`                 | public    | Drops the session cookie                  |
| `<basePath>/auth/:providerId/{login,callback}` | public | Dynamic OIDC flow                       |
| `<basePath>/`                            | gated     | Redirects to `<basePath>/admin/pages`     |
| `<basePath>/admin/*`                     | gated     | Static admin pages (Pages, Files, …)      |
| `<basePath>/api/*`                       | gated     | File-routed REST endpoints                |
| `<basePath>/assets/*`                    | public    | `control-components.js` + `control-styles.css` |
| `<basePath>/resources/*`                 | public    | Fonts + theme CSS (`@bernouy/components`) |

The auth guard (`createAuthGuard` from `@bernouy/cms-auth`) checks the
`subject.role === "admin"` and redirects unauth'd browser navigations to
`<basePath>/login`. JSON API calls get a 401 / 403 instead.

---

## Sub-entries for Bloc authoring

Bloc files compiled from collection integrations need two browser-safe entry points; the
visitor bundle (`Bloc.ts`) must NEVER reach editor code:

- `@bernouy/cms-control/component` — `export { Component }` only.
  Imported by `Bloc.ts`, bundled into the view JS shipped to visitors.
- `@bernouy/cms-control/editor` — editor authoring entry for `Editor`,
  `registerEditor`, and `registerEditor_opaque`. Editor contracts live in
  `@bernouy/cms-content/editor`.

The `editor` entry is intercepted by `p9rExternalsPlugin` (in
`@bernouy/cms-bloc-compile`) so its symbols read from `window.p9rEditor` —
same canonical class across every bloc, preserving `instanceof` checks.

---

## What this package is NOT

- **Not the public renderer.** Use `@bernouy/cms-delivery` for that.
- **Not a persistence layer.** Repos / stores live in the feature packages;
  pass impls in via the constructor.
- **Not the auth chain.** `LocalAuthentication` + `OidcAuthentication`
  live in `@bernouy/cms-auth`; assemble them and pass the result as
  `auth`.

For a working full-stack image (admin + delivery + nginx, all in
memory), see `images/cms/` at the repo root.
