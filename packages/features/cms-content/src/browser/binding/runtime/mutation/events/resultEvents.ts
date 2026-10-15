import type { FormSubmitResult } from "../../../form/formSubmit";

/**
 * Dispatched by a submitted `cms-mutation` after a successful HTTP response and any requested query refresh, and
 * before publication, form reset, or redirection.
 */
export const CMS_MUTATION_SUCCESS_EVENT = "cms-mutation:success" as const;

/**
 * Dispatched by a submitted `cms-mutation` after an HTTP or network failure.
 */
export const CMS_MUTATION_FAILED_EVENT = "cms-mutation:failed" as const;

/** Public event payload shared by successful and failed mutation submissions. */
export type CmsMutationResultEvent = CustomEvent<FormSubmitResult>;

/** Event map exposed for consumers that wrap or forward mutation submissions. */
export interface CmsMutationResultEventMap {
    [CMS_MUTATION_SUCCESS_EVENT]: CmsMutationResultEvent;
    [CMS_MUTATION_FAILED_EVENT]: CmsMutationResultEvent;
}

declare global {
    interface HTMLElementEventMap extends CmsMutationResultEventMap {}
    interface DocumentEventMap extends CmsMutationResultEventMap {}
}
