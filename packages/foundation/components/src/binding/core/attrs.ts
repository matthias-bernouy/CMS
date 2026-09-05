export const BINDING_CORE_TAG = "cms-binding-core";
export const BINDING_DISABLED_ATTR = "cms-binding-disabled";
export const SOURCE_STATE_FORCE_ATTR = "cms-source-state-force";
export const SOURCE_ATTR = "cms-source";
export const SOURCE_BODY_ATTR = "cms-source-body";
export const SOURCE_ID_ATTR = "cms-source-id";
export const SOURCE_TRIGGER_ATTR = "cms-source-trigger";
export const SOURCE_METHOD_ATTR = "cms-source-method";
export const SOURCE_PUBLISH_ATTR = "cms-source-publish";
export const SOURCE_SUCCESS_RESET_ATTR = "cms-source-success-reset";
export const SOURCE_SUCCESS_REDIRECT_ATTR = "cms-source-success-redirect";
export const SOURCE_SUCCESS_REDIRECT_PARAM_ATTR = "cms-source-success-redirect-param";
export const REPEAT_ATTR = "cms-repeat";
export const CONDITION_ATTR = "cms-condition";
export const PARAM_SYNC_ATTR = "cms-param-sync";
export const PAGE_STATE_ATTR = "cms-page-state";

export const SOURCE_STATES = ["loaded", "loading", "empty", "error"] as const;
export type SourceState = (typeof SOURCE_STATES)[number];
export const SOURCE_TRIGGERS = ["auto", "submit", "change"] as const;
export type SourceTrigger = (typeof SOURCE_TRIGGERS)[number];
export const SOURCE_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] as const;
export type SourceMethod = (typeof SOURCE_METHODS)[number];

/**
 * Marks a subtree the runtime must NOT discover sources within. Unlike a
 * nested `<cms-binding-core>` (which owns its own data), a `[cms-bind-stop]`
 * region is left INERT: the editor wraps the injected page content in it so the
 * chrome core still INJECTS the content (`{{ content | innerHTML }}` runs
 * through the reactive template) but never registers or
 * executes the content's own `cms-source` / `cms-param-sync`. The content stays
 * an editable template; rendering it with data is delivery's job. Runtime
 * discovery boundary only, and a complete
 * no-op in delivery where no element carries it.
 */
export const BIND_STOP_ATTR = "cms-bind-stop";
export const READY_ATTR = "cms-ready";

export function isSourceState(value: string | null): value is SourceState {
    return (SOURCE_STATES as readonly string[]).includes(value ?? "");
}

export function isSourceTrigger(value: string | null): value is SourceTrigger {
    return (SOURCE_TRIGGERS as readonly string[]).includes(value ?? "");
}

export function isSourceMethod(value: string | null): value is SourceMethod {
    return (SOURCE_METHODS as readonly string[]).includes((value ?? "").toUpperCase());
}
