/**
 * @bernouy/cms-bloc-compile — the bloc compile pipeline (admin `bloc.post`
 * upload + `p9r` CLI).
 *
 * Note on the `@bernouy/cms-control/editor` strings in `prepare_bloc`: they
 * are the bloc AUTHORING convention (what a bloc's Editor.ts imports), not a
 * dependency — `p9rExternalsPlugin` intercepts those specifiers during
 * `Bun.build` and rewrites them to the `window.p9r` globals, so they are
 * never resolved from disk.
 */

export { prepare_bloc }                  from "cms-bloc-compile/core/prepare_bloc";
export { validateBloc, validateBlocTag } from "cms-bloc-compile/core/validateBloc";
export { p9rExternalsPlugin }            from "cms-bloc-compile/core/p9rExternalsPlugin";
