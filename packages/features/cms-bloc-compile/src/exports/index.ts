/**
 * @bernouy/cms-bloc-compile — the bloc compile pipeline for admin uploads and
 * collection integration packaging.
 *
 * Shared browser imports are rewritten by `p9rExternalsPlugin` during
 * `Bun.build`, so visitor bundles reuse host runtime APIs.
 */

export { prepare_bloc } from "cms-bloc-compile/core/prepare_bloc";
export { isNativeBlocTag } from "cms-bloc-compile/core/nativeBlocTags";
export { validateBloc, validateBlocTag } from "cms-bloc-compile/core/validateBloc";
export { p9rExternalsPlugin } from "cms-bloc-compile/core/p9rExternalsPlugin";
export { generateSiteBlocSourceBundle } from "cms-bloc-compile/core/site-bloc/generateSiteBlocSourceBundle";
export {
    serializeSiteBlocDefault,
    serializeSiteBlocTemplate,
} from "cms-bloc-compile/core/site-bloc/siteBlocHtml";
