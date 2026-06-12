export const CMS_BINDING_ATTRIBUTES = {
    condition: "cms-condition",
    repeat:    "cms-repeat",
    source:    "cms-source",
    slot:      "cms-slot",
} as const;

export type CmsBindingAttribute = typeof CMS_BINDING_ATTRIBUTES[keyof typeof CMS_BINDING_ATTRIBUTES];

const INTERPOLATION_PATTERN = /^\s*\{\{\s*([\s\S]*?)\s*\}\}\s*$/;

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
