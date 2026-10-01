/**
 * @bernouy/cms-collection-build — the build pipeline for collection Bloc
 * browser artifacts and site-owned collection sources.
 *
 * Shared browser imports are rewritten by `p9rExternalsPlugin` during
 * `Bun.build`, so visitor bundles reuse host runtime APIs.
 */

export { buildCollectionBloc } from "cms-collection-build/core/buildCollectionBloc";
export { isNativeBlocTag } from "cms-collection-build/core/nativeBlocTags";
export { validateBloc, validateBlocTag } from "cms-collection-build/core/validateBloc";
export { p9rExternalsPlugin } from "cms-collection-build/core/p9rExternalsPlugin";
export { generateSiteBlocSourceBundle } from "cms-collection-build/core/site-bloc/generateSiteBlocSourceBundle";
export {
    serializeSiteBlocDefault,
    serializeSiteBlocTemplate,
} from "cms-collection-build/core/site-bloc/siteBlocHtml";
