# @bernouy/cms-control

Admin layer of the CMS — REST API and server-rendered admin pages. Mounts on a
runner you provide. Runs on **Bun** and ships
as a Bun-first package — no transpile, consumers execute the TypeScript
source directly.

Pair it with:

- **`@bernouy/cms-delivery`** for the public-facing rendering layer.
- **`@bernouy/cms-content`**, its **`./files`** subpath, and
  **`@bernouy/secret-store`** for persistence contracts and default stores.
- **`@bernouy/cms-auth`** for the auth chain (login + signed cookie +
  PATs).

A working composition lives in `packages/runtimes/cms-server/src/runtime/`.

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
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import { InMemoryCmsFilesMetadata } from "@bernouy/cms-content/files";
import { InMemorySecretStore } from "@bernouy/secret-store";

const runner = new BunRunner();

runner.group("/cms", (sub) => {
    // Wire the auth chain. For a 5-minute demo, swap LocalAuthentication
    // for InMemoryAuthentication and skip the seeding step below.
    const codec    = new SignedCookieCodec(new TextEncoder().encode(SESSION_SECRET));
    const users    = new InMemoryUsersRepository();
    const pats     = new InMemoryPatRepository();
    const resolver = new SubjectResolver(users);

    const auth = new LocalAuthentication({
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
        new MemoryBlobStore(),
        users,
        new InMemoryIdentityProviderRepository(),
        pats,
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
    auth:                Authentication,
    options:             { publicAuth?: PublicAuthRoutesConfig } = {},
    cache?:              Cache,
    secrets?:            SecretStore,
    filesMetadata?:      CmsFilesMetadataRepository,
    filesBlob?:          BlobStore,
    users?:              UsersRepository,
    identityProviders?:  IdentityProviderRepository,
    pats?:               PatRepository,
    credentials?:        LocalCredentialStore,
    authBackends?:       { local?: LocalAuthenticationActions; oidc?: OidcAuthHandlers },
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

Use it as a drop-in `Authentication` when you want to skip
the login flow during local dev or in the manual test harness. It
returns a fixed `Subject` for every request — never use it in
production. Import it from `@bernouy/cms-auth`.

```ts
import { InMemoryAuthentication } from "@bernouy/cms-auth";

const auth = new InMemoryAuthentication({ identifier: "ulvia-local-development" });
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

The auth guard (`createAuthGuard` from `@bernouy/cms-auth/http`) establishes an
authenticated subject. It does not evaluate roles or view permissions. Control
chooses the unauthenticated response for each route group: a login redirect or
an explicit unauthorized response. File-routed APIs are administrator-only by
default. The boundary allows members only their self-service profile and token
routes plus assigned dashboard reads; those dashboard reads then apply their
assignment-specific checks. High-impact administrative handlers also fail
closed through `requireControlAdministrator` before parsing input or accessing
their stores.

Public auth routes receive operations created with `createPublicAuthActions`,
not credential, user or recovery-token stores. Control can additionally receive
`publicAuth.emailTest`, created with `createAuthEmailTestSender` from
`@bernouy/cms-auth/management`; Delivery does not receive this admin capability.

---

## Browser sub-entry for Bloc compilation

Bloc files compiled from collection integrations use one browser-safe entry
point. The visitor bundle (`Bloc.ts`) must never reach server code:

- `@bernouy/cms-control/component` — `export { Component }` only.
  Imported by `Bloc.ts`, bundled into the view JS shipped to visitors.
Collection settings and slot metadata live in admitted collection JSON; no
compiled editor bundle or editor authoring sub-entry exists.

---

## What this package is NOT

- **Not the public renderer.** Use `@bernouy/cms-delivery` for that.
- **Not a persistence layer.** Repos / stores live in the feature packages;
  pass impls in via the constructor.
- **Not the auth chain.** `LocalAuthentication` + `OidcAuthentication`
  live in `@bernouy/cms-auth`; assemble them and pass the result as
  `auth`.

For production adapter and surface wiring, see `packages/runtimes/cms-server/`.
