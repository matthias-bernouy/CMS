/**
 * @bernouy/cms-bloc-compile — the bloc compile pipeline (admin `bloc.post`
 * upload + `p9r` CLI).
 *
 * Editor authoring imports are rewritten by `p9rExternalsPlugin` during
 * `Bun.build`, so they resolve to the editor runtime globals instead of
 * bundling the CMS editor.
 */

export { prepare_bloc } from "cms-bloc-compile/core/prepare_bloc";
export { isNativeBlocTag } from "cms-bloc-compile/core/nativeBlocTags";
export { validateBloc, validateBlocTag } from "cms-bloc-compile/core/validateBloc";
export { p9rExternalsPlugin } from "cms-bloc-compile/core/p9rExternalsPlugin";
