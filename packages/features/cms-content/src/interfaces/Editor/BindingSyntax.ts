export const CMS_BINDING_CORE_TAG = "cms-binding-core";

export const CMS_BINDING_ATTRIBUTES = {
    bindingDisabled:  "cms-binding-disabled",
    condition:        "cms-condition",
    repeat:           "cms-repeat",
    source:           "cms-source",
    sourceStateForce: "cms-source-state-force",
    slot:             "cms-slot",
} as const;

export type CmsBindingAttribute = typeof CMS_BINDING_ATTRIBUTES[keyof typeof CMS_BINDING_ATTRIBUTES];
export type CmsSourceParamValue =
    | { from: "queryParam"; name: string }
    | { from: "raw"; value: string | number | boolean };
export type CmsSourceParamMap = Record<string, CmsSourceParamValue | null | undefined>;
export type CmsSourceBinding = {
    url: string;
    alias?: string;
    params?: CmsSourceParamMap;
};
export type CmsSourceUrl = string;
export type CmsConditionExpression = string;
export type CmsRepeatBinding = {
    path: string;
    alias?: string;
};
export const CMS_SOURCE_STATES = ["loaded", "loading", "empty", "error"] as const;
export type CmsSourceState = typeof CMS_SOURCE_STATES[number];
export type CmsSourceStateForce = CmsSourceState;
export const CMS_SOURCE_SLOT_VALUES = ["loading", "empty", "error"] as const;
export type CmsSourceSlotValue = typeof CMS_SOURCE_SLOT_VALUES[number];

const INTERPOLATION_PATTERN = /^\s*\{\{\s*([\s\S]*?)\s*\}\}\s*$/;
const SOURCE_ALIAS_PATTERN = /^\s*([\s\S]+?)\s+as\s+([A-Za-z_$][\w$]*)\s*$/;
const REPEAT_ALIAS_PATTERN = /^\s*(.+?)\s+as\s+([A-Za-z_$][\w$]*)\s*$/;

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
    if (match) {
        return {
            path: match[1]!.trim(),
            alias: match[2]!,
        };
    }

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

export function isCmsSourceSlotValue(value: string | null): value is CmsSourceSlotValue {
    return (CMS_SOURCE_SLOT_VALUES as readonly string[]).includes(value ?? "");
}

export function isCmsSourceState(value: string | null): value is CmsSourceState {
    return (CMS_SOURCE_STATES as readonly string[]).includes(value ?? "");
}

export function sourceStateFromElement(element: Element): CmsSourceState {
    const value = element.getAttribute(CMS_BINDING_ATTRIBUTES.slot);
    return isCmsSourceSlotValue(value) ? value : "loaded";
}

export function applySourceState(element: Element, state: CmsSourceState): void {
    if (state === "loaded") {
        element.removeAttribute(CMS_BINDING_ATTRIBUTES.slot);
        return;
    }

    element.setAttribute(CMS_BINDING_ATTRIBUTES.slot, state);
}

function sourceUrlWithParams(rawUrl: string, params?: CmsSourceParamMap): string {
    const url = rawUrl.trim();
    if (!params) return url;

    const entries = Object.entries(params).filter((entry): entry is [string, CmsSourceParamValue] => {
        const [name, value] = entry;
        if (name.trim() === "" || value === null || value === undefined) return false;
        if (value.from === "queryParam") return value.name.trim() !== "";
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

function encodeSourceParamValue(value: CmsSourceParamValue): string {
    if (value.from === "queryParam") return `#{${value.name.trim()}}`;
    return encodeURIComponent(String(value.value).trim());
}
