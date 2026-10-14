export const BINDING_CORE_TAG = "cms-binding-core";
export const QUERY_ATTR = "cms-query";
export const QUERY_INPUT_ATTR = "cms-query-input";
export const QUERY_LISTEN_ATTR = "cms-query-listen";
export const QUERY_REFRESH_ATTR = "cms-query-refresh";
export const SOURCE_ATTR = "cms-source";
export const SOURCE_INHERIT_QUERY_ATTR = "cms-source-inherit-query";
export const SOURCE_IDEMPOTENCY_ATTR = "cms-source-idempotency";
export const SOURCE_BODY_ATTR = "cms-source-body";
export const SOURCE_DELAY_ATTR = "cms-source-delay";
export const SOURCE_ID_ATTR = "cms-source-id";
export const SOURCE_TRIGGER_ATTR = "cms-source-trigger";
export const SOURCE_METHOD_ATTR = "cms-source-method";
export const SOURCE_SUCCESS_RESET_ATTR = "cms-source-success-reset";
export const SOURCE_SUCCESS_RELOAD_ATTR = "cms-source-success-reload";
export const SOURCE_SERIALIZATION_ATTR = "cms-source-serialization";
export const SOURCE_SUCCESS_REDIRECT_ATTR = "cms-source-success-redirect";
export const SOURCE_SUCCESS_REDIRECT_PARAM_ATTR = "cms-source-success-redirect-param";
export const REPEAT_ATTR = "cms-repeat";
export const CONDITION_ATTR = "cms-condition";
export const SYNC_ATTR = "cms-sync";

const SOURCE_STATES = ["loaded", "loading", "empty", "error"] as const;
export type SourceState = (typeof SOURCE_STATES)[number];
const SOURCE_TRIGGERS = ["submit", "change"] as const;
export type SourceTrigger = (typeof SOURCE_TRIGGERS)[number];
const SOURCE_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type SourceMethod = (typeof SOURCE_METHODS)[number];

export function isSourceTrigger(value: string | null): value is SourceTrigger {
    return (SOURCE_TRIGGERS as readonly string[]).includes(value ?? "");
}
