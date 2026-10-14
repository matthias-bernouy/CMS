export const CMS_BINDING_CORE_TAG = "cms-binding-core";

export const CMS_BINDING_ATTRIBUTES = {
    condition: "cms-condition",
    match: "cms-match",
    case: "cms-case",
    formValueType: "cms-form-value-type",
    formEmpty: "cms-form-empty",
    sync: "cms-sync",
    query: "cms-query",
    queries: "cms-queries",
    queryInput: "cms-query-input",
    queryListen: "cms-query-listen",
    queryRefresh: "cms-query-refresh",
    mutation: "cms-mutation",
    mutationInput: "cms-mutation-input",
    mutationIdempotency: "cms-mutation-idempotency",
    mutationInvalidates: "cms-mutation-invalidates",
    mutationRedirect: "cms-mutation-redirect",
    mutationRedirectParam: "cms-mutation-redirect-param",
    mutationReset: "cms-mutation-reset",
    repeat: "cms-repeat",
    source: "cms-source",
    sourceBody: "cms-source-body",
    sourceDelay: "cms-source-delay",
    sourceInheritQuery: "cms-source-inherit-query",
    sourceIdempotency: "cms-source-idempotency",
    sourceId: "cms-source-id",
    sourceMethod: "cms-source-method",
    sourceSerialization: "cms-source-serialization",
    sourceSuccessReload: "cms-source-success-reload",
    sourceSuccessRedirect: "cms-source-success-redirect",
    sourceSuccessRedirectParam: "cms-source-success-redirect-param",
    sourceSuccessReset: "cms-source-success-reset",
    sourceTrigger: "cms-source-trigger",
} as const;

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
export const CMS_SOURCE_TRIGGERS = ["submit", "change"] as const;
export const CMS_SOURCE_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export const CMS_SOURCE_STATES = ["loaded", "loading", "empty", "error"] as const;
export const CMS_SOURCE_STATUS_SCOPE = "$source";
export const CMS_SOURCES_STATUS_SCOPE = "$sources";

export type CmsBindingAttribute = (typeof CMS_BINDING_ATTRIBUTES)[keyof typeof CMS_BINDING_ATTRIBUTES];
export type CmsJsonValue = null | string | number | boolean | CmsJsonValue[] | { [key: string]: CmsJsonValue };
export type CmsBindingInputCast = "string" | "number" | "integer" | "boolean";
export type CmsBindingInputPath = readonly (string | number)[];
export type CmsBindingInputValue =
    | { readonly from: "literal"; readonly value: CmsJsonValue }
    | {
          readonly from: "state";
          readonly key: string;
          readonly path?: CmsBindingInputPath;
          readonly cast?: CmsBindingInputCast;
          readonly optional?: boolean;
          readonly fallback?: CmsJsonValue;
      };
export type CmsBindingInputMap = Record<string, CmsBindingInputValue | null | undefined>;
export type CmsSourceBinding = { url: string; alias?: string };
export type CmsSourceBodyBinding = CmsBindingInputMap;
export type CmsSourceUrl = string;
export type CmsConditionExpression = string;
export type CmsMatchExpression = string;
export type CmsCaseValue = string | number | boolean | null;
export type CmsConditionLiteral = string | number | boolean | null;
export type CmsConditionFieldOperator = (typeof CMS_CONDITION_FIELD_OPERATORS)[number];
export type CmsRepeatBinding = { path: string; alias?: string };
export type CmsRepeatRangeBinding = { count: number; alias: string };
export type CmsSourceTrigger = (typeof CMS_SOURCE_TRIGGERS)[number];
export type CmsSourceMethod = (typeof CMS_SOURCE_METHODS)[number];
export type CmsSourceState = (typeof CMS_SOURCE_STATES)[number];
export type CmsSourceStatusCondition = { sourceId?: string; state: CmsSourceState };

export type CmsQueryTarget = {
    readonly contractId: string;
    readonly capabilityId: string;
};
export const CMS_SYNC_SCOPES = ["param", "page", "session", "persistent"] as const;
export type CmsSyncScope = (typeof CMS_SYNC_SCOPES)[number];
export type CmsSyncTarget = { readonly scope: CmsSyncScope; readonly key: string };
export type CmsRemoteQueryBinding = CmsQueryTarget & { readonly name: string };
export type CmsSyncQueryBinding = { readonly sync: CmsSyncTarget; readonly name: string };
export type CmsQueryBinding = CmsRemoteQueryBinding | CmsSyncQueryBinding;
export type CmsQueriesBinding = readonly CmsSyncQueryBinding[];
export type CmsQueryInput = CmsBindingInputMap;
export type CmsQueryListen = readonly CmsSyncTarget[];
export type CmsQueryRefreshPolicy = {
    readonly intervalMs?: number;
    readonly focus: boolean;
    readonly reconnect: boolean;
};
export type CmsMutationBinding = CmsRemoteQueryBinding;
export type CmsMutationInput = CmsBindingInputMap;

export const CMS_SOURCE_SERIALIZATIONS = ["typed-json"] as const;
export const CMS_FORM_VALUE_TYPES = ["string", "number", "boolean", "json"] as const;
export const CMS_FORM_EMPTY_BEHAVIORS = ["null", "omit"] as const;
export type CmsSourceSerialization = (typeof CMS_SOURCE_SERIALIZATIONS)[number];
export type CmsFormValueType = (typeof CMS_FORM_VALUE_TYPES)[number];
export type CmsFormEmptyBehavior = (typeof CMS_FORM_EMPTY_BEHAVIORS)[number];
