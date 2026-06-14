export const CMS_BINDING_ATTRIBUTES = {
    condition: "cms-condition",
    repeat:    "cms-repeat",
    source:    "cms-source",
    slot:      "cms-slot",
} as const;

export type CmsBindingAttribute = typeof CMS_BINDING_ATTRIBUTES[keyof typeof CMS_BINDING_ATTRIBUTES];
export type CmsSourceUrl = string;
export type CmsConditionExpression = string;
export type CmsRepeatBinding = {
    path: string;
    alias?: string;
};

const INTERPOLATION_PATTERN = /^\s*\{\{\s*([\s\S]*?)\s*\}\}\s*$/;
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

export function asSource(url: CmsSourceUrl): string {
    return url.trim();
}

export function parseSource(value: string): CmsSourceUrl | null {
    const url = value.trim();
    return url ? url : null;
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
