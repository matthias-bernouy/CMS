import { messageErrorSchema, pageValidationErrorSchema } from "cms-content/application/schemas/errors/models";
export const deliveryResolveResourceErrors = {
    INVALID_INPUT: { retryable: false, output: messageErrorSchema },
    FORBIDDEN: { retryable: false, output: messageErrorSchema },
    CORE_UNAVAILABLE: { retryable: true, output: messageErrorSchema },
};
export const exampleErrors = {
    INVALID_INPUT: { retryable: false, output: messageErrorSchema },
};
export const localizationTextSaveErrors = {
    INVALID_INPUT: { retryable: false, output: messageErrorSchema },
    NOT_FOUND: { retryable: false, output: messageErrorSchema },
    REVISION_CONFLICT: { retryable: false, output: messageErrorSchema },
    UPGRADE_IN_PROGRESS: { retryable: true, output: messageErrorSchema },
    CORE_UNAVAILABLE: { retryable: true, output: messageErrorSchema },
};
export const localizationUpdateErrors = {
    INVALID_INPUT: { retryable: false, output: messageErrorSchema },
    REVISION_CONFLICT: { retryable: false, output: messageErrorSchema },
    UPGRADE_IN_PROGRESS: { retryable: true, output: messageErrorSchema },
    CORE_UNAVAILABLE: { retryable: true, output: messageErrorSchema },
};
export const lookupErrors = {
    NOT_FOUND: { retryable: false, output: messageErrorSchema },
    CORE_UNAVAILABLE: { retryable: true, output: messageErrorSchema },
};
export const serviceErrors = {
    CORE_UNAVAILABLE: { retryable: true, output: messageErrorSchema },
};
export const pagesCreateErrors = {
    PATH_CONFLICT: { retryable: false, output: messageErrorSchema },
    INVALID_PAGE: { retryable: false, output: pageValidationErrorSchema },
    CORE_UNAVAILABLE: { retryable: true, output: messageErrorSchema },
};
export const pagesDeleteErrors = {
    NOT_FOUND: { retryable: false, output: messageErrorSchema },
    REVISION_CONFLICT: { retryable: true, output: messageErrorSchema },
    CORE_UNAVAILABLE: { retryable: true, output: messageErrorSchema },
    PAGE_REFERENCED: { retryable: false, output: messageErrorSchema },
    INVALID_PAGE: { retryable: false, output: pageValidationErrorSchema },
};
export const pagesPublishErrors = {
    NOT_FOUND: { retryable: false, output: messageErrorSchema },
    INVALID_PAGE: { retryable: false, output: pageValidationErrorSchema },
    REVISION_CONFLICT: { retryable: true, output: messageErrorSchema },
    CORE_UNAVAILABLE: { retryable: true, output: messageErrorSchema },
};
export const pagesRenameErrors = {
    NOT_FOUND: { retryable: false, output: messageErrorSchema },
    REVISION_CONFLICT: { retryable: true, output: messageErrorSchema },
    INVALID_TITLE: { retryable: false, output: messageErrorSchema },
    CORE_UNAVAILABLE: { retryable: true, output: messageErrorSchema },
};
export const pagesUpdateRouteErrors = {
    NOT_FOUND: { retryable: false, output: messageErrorSchema },
    REVISION_CONFLICT: { retryable: true, output: messageErrorSchema },
    PATH_CONFLICT: { retryable: false, output: messageErrorSchema },
    INVALID_PAGE: { retryable: false, output: pageValidationErrorSchema },
    CORE_UNAVAILABLE: { retryable: true, output: messageErrorSchema },
};
export const pagesUpdateSeoErrors = {
    NOT_FOUND: { retryable: false, output: messageErrorSchema },
    REVISION_CONFLICT: { retryable: true, output: messageErrorSchema },
    INVALID_PAGE: { retryable: false, output: pageValidationErrorSchema },
    CORE_UNAVAILABLE: { retryable: true, output: messageErrorSchema },
};
export const siteBlocsArchiveErrors = {
    NOT_FOUND: { retryable: false, output: messageErrorSchema },
    REVISION_CONFLICT: { retryable: false, output: messageErrorSchema },
    TAG_CONFLICT: { retryable: false, output: messageErrorSchema },
    CORE_UNAVAILABLE: { retryable: true, output: messageErrorSchema },
};
export const siteBlocsCreateErrors = {
    TAG_CONFLICT: { retryable: false, output: messageErrorSchema },
    INVALID_SITE_BLOC: { retryable: false, output: messageErrorSchema },
    CORE_UNAVAILABLE: { retryable: true, output: messageErrorSchema },
};
export const siteBlocsPublishErrors = {
    NOT_FOUND: { retryable: false, output: messageErrorSchema },
    REVISION_CONFLICT: { retryable: false, output: messageErrorSchema },
    INVALID_SITE_BLOC: { retryable: false, output: messageErrorSchema },
    CORE_UNAVAILABLE: { retryable: true, output: messageErrorSchema },
};
export const themeActivateErrors = {
    INVALID_INPUT: { retryable: false, output: messageErrorSchema },
    NOT_FOUND: { retryable: false, output: messageErrorSchema },
    REVISION_CONFLICT: { retryable: false, output: messageErrorSchema },
    CORE_UNAVAILABLE: { retryable: true, output: messageErrorSchema },
};
