/**
 * @bernouy/cms-bloc-compile — the bloc compile pipeline (admin `bloc.post`
 * upload + `p9r` CLI).
 *
 * Note on editor authoring imports (`@bernouy/cms-content/editor` for the new
 * stable catalog API, with legacy `@bernouy/cms-control/editor` still
 * intercepted): `p9rExternalsPlugin` rewrites them during `Bun.build`, so they
 * resolve to the editor runtime globals instead of bundling the CMS editor.
 */

export { prepare_bloc }                  from "cms-bloc-compile/core/prepare_bloc";
export { validateBloc, validateBlocTag } from "cms-bloc-compile/core/validateBloc";
export { p9rExternalsPlugin }            from "cms-bloc-compile/core/p9rExternalsPlugin";
