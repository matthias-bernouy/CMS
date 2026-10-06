# @bernouy/cms-control

Control surface. It mounts on a provided `Runner` and exposes authentication,
shared CMS capability/media routes, collection-backed Control Pages, and the
minimal browser runtime in `src/browser/control-runtime.js`.

## Export Boundaries

- `@bernouy/cms-control`: server-side `ControlCms`.
- `@bernouy/cms-content/browser`: view-side `Component` and declarative binding
  runtime shared by Control and Delivery. Compositions are server-rendered
  resources without a view class.

Do not let the shared browser entry import Control internals or server-only
modules.

## Package Layout

- `src/ControlCms.ts`: mounts routes and wires injected dependencies.
- `src/browser/`: the binding/Bloc host entry, generated runtime bundle and base CSS.
- `src/core/admin/auth/templates/`: kernel-owned authentication documents.
- `src/browser/runtime.ts`: the presentation-free entry bundled into
  `control-runtime.js`.
- `src/core/`: non-browser routing and authorization logic used by the Control kernel.

## HTTP Rules

- Keep kernel routes thin and limited to authentication, capability dispatch,
  Page rendering and bounded binary transports.
- Use `cms-control/...` imports, not long relative chains.
- Do not add a second `/api/*` administration transport alongside the versioned
  `/.cms/call` capabilities and kernel binary transports.

## Control Page Rules

- Control Pages can be immutable collection resources or editable site Pages.
  Both use the shared Page document renderer, site-scoped surface route registry
  and stable Page-reference model. Do not add a filesystem-to-route scanner.
- Build visual Control UI from collection Blocs. Do not reintroduce surface-owned
  `<cms-*>`, `<p9r-*>` or `<w13c-*>` administration components.
- Keep the browser host runtime presentation-free. It may expose binding, the
  base collection `Component` class and provider media helpers only.
- Events that cross shadow boundaries should use a bubbles/composed event
  helper.
- Design tokens and visual components come from installed collections.

## Bloc Runtime Compatibility

- Stable binding contracts live in `@bernouy/cms-content/bindings`.
- The browser assets provide the shared component and binding runtime used by
  rendered collection Pages.
- Keep authored bloc behavior independent from Control internals.

## Dependency Rules

Control is a surface. It consumes feature contracts and receives concrete
stores/repositories through the `ControlCms` constructor. Do not import Mongo or
S3 adapter subpaths here.
