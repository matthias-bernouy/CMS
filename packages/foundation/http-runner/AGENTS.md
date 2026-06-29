# @bernouy/http-runner

Foundation HTTP mounting seam. It owns the `Runner` interface, `BunRunner`,
cache helpers, compression, CSP helpers, request IP capture, and test server
utilities.

## Boundaries

- This package is CMS-agnostic. Do not import `@bernouy/cms-*` packages.
- Root export exposes the server runner and shared HTTP helpers.
- `./html` is the browser-safe helper subpath. Keep it free of Bun/Node server
  imports.
- `./testing` exposes test server helpers only.

## Runner Semantics

- `BunRunner` matches routes lazily per request. Routes added after `start()`
  are honored.
- Exact and `:param` path segments are supported. No regex or catch-all routing.
- Route lookup is linear by method/path registration order. First match wins.
- Default endpoints run only when no route matches. The deepest matching prefix
  wins.
- `removeRoutesByPathPrefix(prefix)` removes routes and default endpoints under
  that prefix. It does not clear global middlewares.

## Groups

`group(prefix, callback, middlewares)` creates a scoped runner sharing the
parent route/default endpoint arrays while exposing a normalized `basePath`.

If you add a method to `BunRunner`, also expose it on the scoped runner literal
inside `group()`, otherwise grouped consumers will not see it.

## Middleware And Errors

Middlewares run in this order:

1. global middlewares registered with `use()`;
2. group/route middlewares.

Thrown errors bubble to the top-level `Bun.serve.fetch` catch, which logs the
error and returns a generic 500 body. Do not leak internal error messages in the
response body.
