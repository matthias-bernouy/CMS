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
export type CmsConditionExpression = string;
export type CmsMatchExpression = string;
export type CmsCaseValue = string | number | boolean | null;
export type CmsConditionLiteral = string | number | boolean | null;
export type CmsConditionFieldOperator = (typeof CMS_CONDITION_FIELD_OPERATORS)[number];
export type CmsRepeatBinding = { path: string; alias?: string };
export type CmsRepeatRangeBinding = { count: number; alias: string };

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

export const CMS_FORM_VALUE_TYPES = ["string", "number", "boolean", "json"] as const;
export const CMS_FORM_EMPTY_BEHAVIORS = ["null", "omit"] as const;
export type CmsFormValueType = (typeof CMS_FORM_VALUE_TYPES)[number];
export type CmsFormEmptyBehavior = (typeof CMS_FORM_EMPTY_BEHAVIORS)[number];
