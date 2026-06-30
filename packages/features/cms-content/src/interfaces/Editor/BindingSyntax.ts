export const CMS_BINDING_CORE_TAG = "cms-binding-core";

export const CMS_BINDING_ATTRIBUTES = {
    bindingDisabled:  "cms-binding-disabled",
    condition:        "cms-condition",
    paramSync:        "cms-param-sync",
    pageState:        "cms-page-state",
    repeat:           "cms-repeat",
    source:           "cms-source",
    sourceId:         "cms-source-id",
    sourceMethod:     "cms-source-method",
    sourcePublish:    "cms-source-publish",
    sourceSuccessRedirect: "cms-source-success-redirect",
    sourceSuccessReset:    "cms-source-success-reset",
    sourceStateForce: "cms-source-state-force",
    sourceTrigger:    "cms-source-trigger",
} as const;
export const CMS_BINDING_RUNTIME_ATTRIBUTES = { ready: "cms-ready" } as const;

export type CmsBindingAttribute = typeof CMS_BINDING_ATTRIBUTES[keyof typeof CMS_BINDING_ATTRIBUTES];
export type CmsSourceParamValue =
    | { from: "queryParam"; name: string }
    | { from: "state"; name: string }
    | { from: "raw"; value: string | number | boolean };
export type CmsSourceParamMap = Record<string, CmsSourceParamValue | null | undefined>;
export type CmsSourceBinding = { url: string; alias?: string; params?: CmsSourceParamMap };
export type CmsSourceUrl = string;
export type CmsConditionExpression = string;
export type CmsRepeatBinding = { path: string; alias?: string };
export const CMS_SOURCE_TRIGGERS = ["auto", "submit"] as const;
export type CmsSourceTrigger = typeof CMS_SOURCE_TRIGGERS[number];
export const CMS_SOURCE_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] as const;
export type CmsSourceMethod = typeof CMS_SOURCE_METHODS[number];
export const CMS_SOURCE_STATES = ["loaded", "loading", "empty", "error"] as const;
export type CmsSourceState = typeof CMS_SOURCE_STATES[number];
export type CmsSourceStateForce = CmsSourceState;
export const CMS_SOURCE_STATUS_SCOPE = "$source";
export const CMS_SOURCES_STATUS_SCOPE = "$sources";
export type CmsSourceStatusCondition = { sourceId?: string; state: CmsSourceState };

const INTERPOLATION_PATTERN = /^\s*\{\{\s*([\s\S]*?)\s*\}\}\s*$/;
const SOURCE_ALIAS_PATTERN = /^\s*([\s\S]+?)\s+as\s+([A-Za-z_$][\w$]*)\s*$/;
const REPEAT_ALIAS_PATTERN = /^\s*(.+?)\s+as\s+([A-Za-z_$][\w$]*)\s*$/;
const SOURCE_STATUS_ID_PATTERN = /^[A-Za-z_$][\w$-]*$/;

export function asInterpolation(expression: string): string {
    return `{{ ${expression.trim()} }}`;
}

export function parseInterpolation(value: string): string | null {
    const match = INTERPOLATION_PATTERN.exec(value);
    const expression = match?.[1]?.trim();
    return expression ? expression : null;
}

export function isInterpolation(value: string): boolean {
    return parseInterpolation(value) !== null;
}

export function asSource(source: CmsSourceUrl | CmsSourceBinding): string {
    if (typeof source === "string") return source.trim();

    const url = sourceUrlWithParams(source.url, source.params);
    const alias = source.alias?.trim();
    return alias ? `${url} as ${alias}` : url;
}

export function parseSource(value: string): CmsSourceBinding | null {
    const match = SOURCE_ALIAS_PATTERN.exec(value);
    if (match) {
        const url = match[1]!.trim();
        return url ? { url, alias: match[2]! } : null;
    }

    const url = value.trim();
    return url ? { url } : null;
}

export function asRepeat(binding: CmsRepeatBinding): string {
    const path = binding.path.trim();
    const alias = binding.alias?.trim();
    return alias ? `${path} as ${alias}` : path;
}

export function parseRepeat(value: string): CmsRepeatBinding | null {
    const match = REPEAT_ALIAS_PATTERN.exec(value);
    if (match) return { path: match[1]!.trim(), alias: match[2]! };

    const path = value.trim();
    return path ? { path } : null;
}

export function asCondition(expression: CmsConditionExpression): string {
    return expression.trim();
}

export function parseCondition(value: string): CmsConditionExpression | null {
    const expression = value.trim();
    return expression ? expression : null;
}

export function asSourceStatusCondition(state: CmsSourceState, sourceId?: string): CmsConditionExpression {
    const id = sourceId?.trim();
    if (id && !SOURCE_STATUS_ID_PATTERN.test(id)) {
        throw new Error(`Invalid source status id: "${sourceId}"`);
    }
    return id ? `${CMS_SOURCES_STATUS_SCOPE}.${id}.${state}` : `${CMS_SOURCE_STATUS_SCOPE}.${state}`;
}

export function asSourceStatusConditions(conditions: CmsSourceStatusCondition[]): CmsConditionExpression {
    return conditions
        .map(condition => asSourceStatusCondition(condition.state, condition.sourceId))
        .join(" || ");
}

export function parseSourceStatusCondition(value: string | null): CmsSourceState | null {
    return parseSourceStatusConditionDetails(value)?.state ?? null;
}

export function parseSourceStatusConditionDetails(value: string | null): CmsSourceStatusCondition | null {
    const conditions = parseSourceStatusConditions(value);
    return conditions.length === 1 ? conditions[0]! : null;
}

export function parseSourceStatusConditions(value: string | null): CmsSourceStatusCondition[] {
    const expression = value?.trim() ?? "";
    if (!expression) return [];

    const conditions: CmsSourceStatusCondition[] = [];
    for (const part of expression.split(/\s*\|\|\s*/)) {
        const condition = parseSingleSourceStatusCondition(part);
        if (!condition) return [];
        conditions.push(condition);
    }
    return conditions;
}

export function sourceStatusConditionFromElement(element: Element): CmsSourceState | null {
    return parseSourceStatusCondition(element.getAttribute(CMS_BINDING_ATTRIBUTES.condition));
}

export function sourceStatusConditionDetailsFromElement(element: Element): CmsSourceStatusCondition | null {
    return parseSourceStatusConditionDetails(element.getAttribute(CMS_BINDING_ATTRIBUTES.condition));
}

export function sourceStatusConditionsFromElement(element: Element): CmsSourceStatusCondition[] {
    return parseSourceStatusConditions(element.getAttribute(CMS_BINDING_ATTRIBUTES.condition));
}

export function applySourceStatusCondition(element: Element, state: CmsSourceState, sourceId?: string): void {
    element.setAttribute(CMS_BINDING_ATTRIBUTES.condition, asSourceStatusCondition(state, sourceId));
}

export function applySourceStatusConditions(element: Element, conditions: CmsSourceStatusCondition[]): void {
    if (conditions.length === 0) {
        element.removeAttribute(CMS_BINDING_ATTRIBUTES.condition);
        return;
    }
    element.setAttribute(CMS_BINDING_ATTRIBUTES.condition, asSourceStatusConditions(conditions));
}

export function clearSourceStatusCondition(element: Element): void {
    if (sourceStatusConditionsFromElement(element).length > 0) {
        element.removeAttribute(CMS_BINDING_ATTRIBUTES.condition);
    }
}

export function isCmsSourceState(value: string | null): value is CmsSourceState {
    return (CMS_SOURCE_STATES as readonly string[]).includes(value ?? "");
}

export function isCmsSourceTrigger(value: string | null): value is CmsSourceTrigger {
    return (CMS_SOURCE_TRIGGERS as readonly string[]).includes(value ?? "");
}

export function isCmsSourceMethod(value: string | null): value is CmsSourceMethod {
    return (CMS_SOURCE_METHODS as readonly string[]).includes((value ?? "").toUpperCase());
}

export function clearBindingRuntimeState(root: Element): void {
    const attr = CMS_BINDING_RUNTIME_ATTRIBUTES.ready;
    root.removeAttribute(attr);
    root.querySelectorAll(`[${attr}]`).forEach((element) => element.removeAttribute(attr));
}

function sourceUrlWithParams(rawUrl: string, params?: CmsSourceParamMap): string {
    const url = rawUrl.trim();
    if (!params) return url;

    const entries = Object.entries(params).filter((entry): entry is [string, CmsSourceParamValue] => {
        const [name, value] = entry;
        if (name.trim() === "" || value === null || value === undefined) return false;
        if (value.from === "queryParam") return value.name.trim() !== "";
        if (value.from === "state") return value.name.trim() !== "";
        return String(value.value).trim() !== "";
    });
    if (entries.length === 0) return url;

    const hashIndex = url.indexOf("#");
    const beforeHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
    const hash = hashIndex === -1 ? "" : url.slice(hashIndex);
    const separator = beforeHash.endsWith("?") || beforeHash.endsWith("&")
        ? ""
        : beforeHash.includes("?")
        ? "&"
        : "?";
    const query = entries.map(([name, value]) => `${encodeURIComponent(name)}=${encodeSourceParamValue(value)}`).join("&");
    return `${beforeHash}${separator}${query}${hash}`;
}

function parseSingleSourceStatusCondition(value: string): CmsSourceStatusCondition | null {
    const expression = value.trim();
    for (const state of CMS_SOURCE_STATES) {
        if (expression === asSourceStatusCondition(state)) return { state };
    }

    const match = /^\$sources\.([A-Za-z_$][\w$-]*)\.(loaded|loading|empty|error)$/.exec(expression);
    if (!match) return null;
    return { sourceId: match[1]!, state: match[2] as CmsSourceState };
}

function encodeSourceParamValue(value: CmsSourceParamValue): string {
    if (value.from === "queryParam") return `#{${value.name.trim()}}`;
    if (value.from === "state") return `@{${value.name.trim()}}`;
    return encodeURIComponent(String(value.value).trim());
}
