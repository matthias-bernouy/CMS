const CMS_QUERY_PARAM_NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.:-]*$/;
const CMS_QUERY_PARAM_TOKEN_PATTERN = /^\s*#\{\s*([A-Za-z0-9_][A-Za-z0-9_.:-]*)\s*\}\s*$/;

export function isCmsQueryParamName(value: string | null | undefined): value is string {
    return typeof value === "string" && CMS_QUERY_PARAM_NAME_PATTERN.test(value);
}

export function asQueryParamToken(name: string): string {
    const normalized = name.trim();
    if (!isCmsQueryParamName(normalized)) {
        throw new Error(`Invalid CMS query param name: "${name}"`);
    }
    return `#{${normalized}}`;
}

export function parseQueryParamToken(value: string | null | undefined): string | null {
    return CMS_QUERY_PARAM_TOKEN_PATTERN.exec(value ?? "")?.[1] ?? null;
}
