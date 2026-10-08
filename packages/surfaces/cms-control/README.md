# @bernouy/cms-control

Control surface of the CMS — authentication bootstrap and shared CMS
capability routes. Authored Control pages are collection resources;
the former filesystem-backed admin application has been removed. Mounts on a
runner you provide. Runs on **Bun** and ships
as a Bun-first package — no transpile, consumers execute the TypeScript
source directly.

Pair it with:

- **`@bernouy/cms-delivery`** for the public-facing rendering layer.
- **`@bernouy/cms-content`** for authored content persistence.
- **`@bernouy/cms-files`** through the selected `ulvia.cms.files` provider for
  file operations.
- **`@bernouy/cms-auth`** for the auth chain (login + signed cookie +
  PATs).

A working composition lives in `packages/runtimes/cms-server/src/runtime/`.

---

## Installation

This package lives in the `@bernouy/cms-workspace` monorepo as a workspace
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
    LocalAuthentication, SubjectResolver,
    InMemoryUsersRepository, InMemoryIdentityProviderRepository,
    InMemoryLocalCredentialStore, InMemoryPatRepository,
    SignedCookieCodec,
} from "@bernouy/cms-auth";
import { InMemoryRateLimiter } from "@bernouy/rate-limiter";
import { InMemoryCmsRepository } from "@bernouy/cms-content";

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
        defaultHome:   "/cms/admin",
    });

    new ControlCms(
        sub,
        new InMemoryCmsRepository(),
        auth,
        {
            cache: new InMemoryCache(),
            identityProviders: new InMemoryIdentityProviderRepository(),
            authBackends: { local: auth },
        },
    );
});

runner.start(3000);
```

### Constructor signature

```ts
new ControlCms(
    runner: Runner,
    repository: CmsRepository,
    auth: Authentication,
    dependencies: {
        configuration?: ControlCmsOptions;
        cache?: Cache;
        identityProviders?: IdentityProviderRepository;
        authBackends?: { local?: LocalAuthenticationActions; oidc?: OidcAuthHandlers };
    } = {},
)
```

The first three arguments are required. Optional dependencies are grouped by
name so adding or removing a backend cannot shift positional arguments:

| Optional dep         | Disabling effect                              |
|----------------------|-----------------------------------------------|
| `cache`              | Defaults to `InMemoryCache`                   |
| `identityProviders`  | The login page cannot list configured OIDC methods |
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
new ControlCms(sub, repo, auth);
```

`ulvia dev` wires the complete local stack and exposes development credentials
through `ulvia dev credentials`.

---

## URLs exposed under the runner's `basePath` (e.g. `/cms`)

| Path                                     | Auth      | Purpose                                   |
|------------------------------------------|-----------|-------------------------------------------|
| `<basePath>/login`                       | public    | Standalone login page (form + OIDC list)  |
| `<basePath>/auth/methods`                | public    | JSON discovery of enabled providers       |
| `<basePath>/auth/login`                  | public    | Bootstrap local-provider login            |
| `<basePath>/auth/logout`                 | public    | Drops the bootstrap session cookie        |
| `<basePath>/auth/:providerId/{login,callback}` | public | Dynamic OIDC bootstrap flow             |
| `<basePath>/.cms/auth/*`                 | public    | Bounded account authentication actions    |
| `<basePath>/`                            | gated     | Redirects to `<basePath>/admin`           |
| `<basePath>/admin/*`                     | gated     | Installed collection and site Control Pages |
| `<basePath>/.cms/call/*`                 | gated     | Versioned contract capability calls       |
| `<basePath>/.cms/{style,blocset}`        | gated     | Page theme and exact collection Bloc runtime |
| `<basePath>/assets/*`                    | public    | Minimal binding/host runtime and base CSS |

The auth guard (`createAuthGuard` from `@bernouy/cms-auth/http`) establishes an
authenticated subject. It does not evaluate capability grants or Page execution plans. Control
chooses the unauthenticated response for each route group: a login redirect or
an explicit unauthorized response. Contract capabilities carry their own
declared access class and the Control dispatcher verifies the caller before
execution.

Public auth routes receive operations created with `createPublicAuthActions`,
not credential, user or recovery-token stores. Control can additionally receive
`publicAuth.emailTest`, created with `createAuthEmailTestSender` from
`@bernouy/cms-auth/management`; Delivery does not receive this admin capability.

---

## Shared browser entry for Bloc compilation

Bloc files compiled from collection integrations use one browser-safe entry
point. The visitor bundle (`Bloc.ts`) must never reach server code:

- `@bernouy/cms-content/browser` — shared `Component` and declarative binding
  APIs. The collection compiler maps these imports to the host-owned
  `window.cmsRuntime`, so a Bloc does not rebundle the runtime.
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
