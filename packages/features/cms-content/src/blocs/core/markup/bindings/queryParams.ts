const CMS_QUERY_PARAM_NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.:-]*$/;

export function isCmsQueryParamName(value: string | null | undefined): value is string {
    return typeof value === "string" && CMS_QUERY_PARAM_NAME_PATTERN.test(value);
}
