import type { FormSubmitResult } from "../submit/formSubmit";

/**
 * Dispatched by a submitted `cms-source` after a successful HTTP response and any requested read, and
 * before publication, form reset, or redirection.
 */
export const CMS_SOURCE_SUCCESS_EVENT = "cms-source:success" as const;

/**
 * Dispatched by a submitted `cms-source` after an HTTP or network failure.
 */
export const CMS_SOURCE_FAILED_EVENT = "cms-source:failed" as const;

/** The mutation succeeded, but its requested read failed; do not replay the mutation. */
export const CMS_SOURCE_REFRESH_FAILED_EVENT = "cms-source:refresh-failed" as const;

/** Public event payload shared by successful and failed source submissions. */
export type CmsSourceResultEvent = CustomEvent<FormSubmitResult>;

/** Event map exposed for consumers that wrap or forward source submissions. */
export interface CmsSourceResultEventMap {
    [CMS_SOURCE_SUCCESS_EVENT]: CmsSourceResultEvent;
    [CMS_SOURCE_FAILED_EVENT]: CmsSourceResultEvent;
    [CMS_SOURCE_REFRESH_FAILED_EVENT]: CmsSourceResultEvent;
}

declare global {
    interface HTMLElementEventMap extends CmsSourceResultEventMap {}
    interface DocumentEventMap extends CmsSourceResultEventMap {}
}
