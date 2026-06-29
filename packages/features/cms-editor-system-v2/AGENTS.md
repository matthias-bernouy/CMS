# @bernouy/cms-editor-system-v2

Feature package for the current browser editor shell and runtime types.

## Boundaries

- Root export exposes editor shell events, `Shell`, save config/detail types,
  block picker item types, and editor data-source types.
- The package is browser-facing. Do not import server-only APIs, Mongo/S3
  adapters, runtimes, or Control server internals.
- Stable authoring contracts live in `@bernouy/cms-content/editor`; do not
  redefine them here.

## Rules

- Keep custom events named and typed; Control listens for save/delete events.
- Shared editor data-source behavior belongs in `src/runtime/`.
- UI changes must account for iframe/editor frame boundaries and composed
  events.
- Avoid coupling authored bloc editors to Control-owned implementation details.
