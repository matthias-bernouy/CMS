# @bernouy/auth-composite

Aggregates several `Authentication<Role>` providers behind a single
handle. One file: `src/CompositeAuthentication.ts`.

## What it does

Implements `Authentication<Role>` from `@bernouy/core` by composing
multiple children:

- `getSubject(req)` walks children **in order** and returns the first
  non-null `Subject`. Put bearer providers first to short-circuit cookie
  lookup for API clients.
- `loginUrl` / `buildLoginUrl(returnTo)`:
  - 1 browser-loginable child → delegates straight to that child's URL.
  - ≥ 2 browser-loginable children → mounts a chooser page at
    `<basePath>/login` (default `/auth/login`) listing one button per
    child by `displayName`.
- `profileUrl` / `logoutUrl` → delegated to the **profile child**
  (defaults to the first child with a `displayName`). Bearer providers
  have no meaningful logout, so logout always routes to the cookie
  provider that owns the session state.

## Public API

`CompositeAuthentication<Role>(runner, config)` — single class.

```ts
type CompositeChild<Role> = {
    auth: Authentication<Role>;
    displayName?: string;     // omit → still consulted by getSubject, never on chooser
};

type CompositeAuthenticationConfig<Role> = {
    children:      CompositeChild<Role>[];   // non-empty
    basePath?:     string;                   // default "/auth"
    profileChild?: number;                   // index into children
};
```

## Conventions

- **Children own their callbacks.** The composite only implements
  `Authentication<Role>` — if a child is an `AuthenticationConsumer`,
  it registers its own callback routes; the composite never touches
  them.
- **At least one `displayName` is required.** Otherwise no user could
  ever log in via the browser; the constructor throws.
- **`returnTo` is sanitized** with the same rules as the Keycloak
  consumer (path-only, reject protocol-relative `//evil.com`). If you
  add another path-accepting endpoint, reuse `sanitizeReturnTo`.
- **The chooser page is server-rendered French HTML** with inline CSS,
  via `htmlResponse` from `@bernouy/core`. No JS, no framework. If the
  consumer needs i18n or branding, that's a future split — don't bolt
  options onto this file.

## Dependencies

- runtime: `@bernouy/core` (for `Authentication`, `Subject`, `Runner`, `escapeHtml`, `htmlResponse`)
