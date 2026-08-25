export const CMS_BINDING_CORE_TAG = "cms-binding-core";

export const CMS_BINDING_ATTRIBUTES = {
    bindingDisabled: "cms-binding-disabled",
    condition: "cms-condition",
    paramSync: "cms-param-sync",
    pageState: "cms-page-state",
    repeat: "cms-repeat",
    source: "cms-source",
    sourceBody: "cms-source-body",
    sourceId: "cms-source-id",
    sourceMethod: "cms-source-method",
    sourcePublish: "cms-source-publish",
    sourceSuccessRedirect: "cms-source-success-redirect",
    sourceSuccessReset: "cms-source-success-reset",
    sourceStateForce: "cms-source-state-force",
    sourceTrigger: "cms-source-trigger",
} as const;

export const CMS_BINDING_RUNTIME_ATTRIBUTES = { ready: "cms-ready" } as const;
export const CMS_CONDITION_FIELD_OPERATORS = [
    "truthy",
    "falsy",
    "equals",
    "notEquals",
    "greaterThan",
    "greaterThanOrEqual",
    "lessThan",
    "lessThanOrEqual",
    "empty",
    "notEmpty",
] as const;
export const CMS_SOURCE_TRIGGERS = ["auto", "submit", "change"] as const;
export const CMS_SOURCE_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] as const;
export const CMS_SOURCE_STATES = ["loaded", "loading", "empty", "error"] as const;
export const CMS_SOURCE_STATUS_SCOPE = "$source";
export const CMS_SOURCES_STATUS_SCOPE = "$sources";

export type CmsBindingAttribute = (typeof CMS_BINDING_ATTRIBUTES)[keyof typeof CMS_BINDING_ATTRIBUTES];
export type CmsSourceParamValue =
    | { from: "queryParam"; name: string }
    | { from: "state"; name: string }
    | { from: "raw"; value: string | number | boolean };
export type CmsSourceParamMap = Record<string, CmsSourceParamValue | null | undefined>;
export type CmsSourceBinding = { url: string; alias?: string; params?: CmsSourceParamMap };
export type CmsSourceBodyBinding = CmsSourceParamMap;
export type CmsSourceUrl = string;
export type CmsConditionExpression = string;
export type CmsConditionLiteral = string | number | boolean | null;
export type CmsConditionFieldOperator = (typeof CMS_CONDITION_FIELD_OPERATORS)[number];
export type CmsRepeatBinding = { path: string; alias?: string };
export type CmsRepeatRangeBinding = { count: number; alias: string };
export type CmsSourceTrigger = (typeof CMS_SOURCE_TRIGGERS)[number];
export type CmsSourceMethod = (typeof CMS_SOURCE_METHODS)[number];
export type CmsSourceState = (typeof CMS_SOURCE_STATES)[number];
export type CmsSourceStateForce = CmsSourceState;
export type CmsSourceStatusCondition = { sourceId?: string; state: CmsSourceState };
