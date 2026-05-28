# @bernouy/runner-bun

`Runner` implementation backed by `Bun.serve`. Two files:
`src/BunRunner.ts` (the runner itself) and `src/registerStaticFolder.ts`
(walk-and-register-each-file helper).

## What it implements

The `Runner` contract from `@bernouy/core` — verb routes, prefix groups,
middlewares, default endpoint, IP capture, dynamic route removal. The
runner is request-driven: `start(port = 3000)` opens `Bun.serve` and
matches per request. No route compilation step.

## Routing

- **Exact + dynamic segments only** (`/article/:id`). No regex, no
  catch-all wildcards. `matchPath` splits on `/` and accepts a part if
  it starts with `:` or is literally equal.
- **Method + path lookup is linear**, in registration order. First match
  wins.
- **Default endpoint** runs only when no route matches; the deepest
  matching prefix wins (`defaultEndpoints.sort((a, b) => b.prefix.length - a.prefix.length)`).
  Used by `cms` Delivery to fall through to on-demand page rendering.
- **`removeRoutesByPathPrefix(prefix)`** is the multi-tenant teardown
  hook: drops every route + default endpoint whose path equals the
  prefix or descends from it. Global middlewares are kept.

## Groups and `basePath`

`group(prefix, callback, middlewares)` builds a **scoped runner** that
shares state (routes, middlewares, default endpoints) with the parent
but exposes a normalized `basePath`. Three things to know:

- The trailing `/` is stripped so a `group("/cms", r => r.group("/", …))`
  doesn't propagate a double slash into `{{BASE_PATH}}` substitutions
  downstream (would produce `/cms//assets/foo.css`).
- Children write back into the parent's `routes` / `defaultEndpoints`
  arrays — there is no per-group registry. `removeRoutesByPathPrefix`
  works across the whole tree.
- The scoped runner is built with object-spread + per-method overrides;
  it is **not** a `BunRunner` instance. Methods you add to `BunRunner`
  must also be re-exposed in the `scopedRunner` literal in `group()` or
  consumers using `runner.group()` won't see them.

## Static folder

`registerStaticFolder(folderEntry, runner)` walks the folder
synchronously at boot via `readdirSync` and registers a `GET` per file.
Files are read **lazily per request** with `Bun.file`, so memory stays
flat. Use this for asset trees that should be enumerable at boot;
prefer `serveStaticFolder` from `@bernouy/core` for HTML pages that
need `{{CONTENT}}` / `{{BASE_PATH}}` substitution.

## Middlewares

Composed in order: `globalMiddlewares` (registered via `use()`) first,
then per-route. Each middleware receives `(req, next)` and returns a
`Promise<Response>`. Errors thrown inside a middleware/handler bubble
to the top-level `try/catch` in `Bun.serve.fetch` → 500 + `console.error`.

## IP capture

`Bun.serve.fetch` calls `setRequestIP(request, peer.address)` on entry.
Downstream handlers reach the same value through `runner.getRequestIP(req)`
(or `getRequestIP` directly from `@bernouy/core`). The capture is
per-request — composed runners share the same value.

## Conventions

- **One server per `BunRunner` instance.** `start()` is the only call
  that spawns `Bun.serve`. Calling `start()` twice opens two listeners.
- **Routes registered after `start()` are honored**, because matching
  is lazy at request time. Useful for `the CMS multi-tenant case` mounting tenant
  routes dynamically.
- The 500 response logs the error but never includes the message in the
  body — keep it that way to avoid leaking internals.

## Dependencies

- runtime: `@bernouy/core` (`Runner`, `RouteHandler`, `Middleware`, `setRequestIP`, `getRequestIP`)
