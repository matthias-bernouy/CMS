/** Content capabilities required by the unified site Kernel. */
export type { ContentRepository } from "cms-content/application/interfaces/ContentRepository";
export { createBlocUsageResolver } from "cms-content/blocs/core/usage/resolveUsedBlocTags";
export type { TPage } from "cms-content/pages/interfaces/pages";
export type { PageReference } from "cms-content/pages/interfaces/routing";
export {
    createPageRouteReader,
    resolvePageLinkTarget,
} from "cms-content/pages/core/routing/links";
export { validatePageReference } from "cms-content/pages/core/routing/values";
