# @bernouy/cms-bloc-compile

Feature package for bloc validation and bundling.

## Boundaries

- Root export exposes `prepare_bloc`, `validateBloc`, `validateBlocTag`, and
  `p9rExternalsPlugin`.
- The package is compile-time/browser-bundle infrastructure. Do not import
  surfaces, runtimes, Mongo adapters, or CMS admin internals.
- Editor imports are rewritten by `p9rExternalsPlugin` so generated editor
  bundles use `window.p9rEditor`.

## Rules

- Bloc registration is owned by the build wrapper. User bloc sources must not
  hardcode `customElements.define()`.
- Keep validation errors actionable; they are shown to bloc authors during
  integration audit/release or admin upload.
- Direct `location.*` mutation remains forbidden because the editor cannot
  intercept it safely. Prefer anchors or `history.pushState`.
- `prepare_bloc` uses temporary directories under `os.tmpdir()`. Do not depend
  on the process cwd being writable.
