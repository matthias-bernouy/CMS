# @bernouy/cms-collection-build

Feature package for collection Bloc validation and bundling.

## Boundaries

- Root export exposes `buildCollectionBloc`, `validateBloc`, `validateBlocTag`, and
  `hostRuntimeExternalsPlugin`.
- The package is compile-time/browser-bundle infrastructure. Do not import
  surfaces, runtimes, Mongo adapters, or CMS admin internals.
- Shared browser view imports are rewritten by `hostRuntimeExternalsPlugin`; the
  compiler produces no editor-side artifact.

## Rules

- Bloc registration is owned by the build wrapper. User bloc sources must not
  hardcode `customElements.define()`.
- Keep validation errors actionable; they are shown to bloc authors during
  validation and admin upload.
- Direct `location.*` mutation remains forbidden in authored browser behavior.
  Prefer anchors or `history.pushState`.
- `buildCollectionBloc` uses temporary directories under `os.tmpdir()`. Do not depend
  on the process cwd being writable.
