export { asBindingInput, parseBindingInput } from "./input";
export * from "./query";

const INTERPOLATION_PATTERN = /^\s*\{\{\s*([\s\S]*?)\s*\}\}\s*$/;
const INTERPOLATION_TOKEN_PATTERN = /\{\{\s*([\s\S]*?)\s*\}\}/gu;

export function asInterpolation(expression: string): string {
    return `{{ ${expression.trim()} }}`;
}

export function parseInterpolation(value: string): string | null {
    const match = INTERPOLATION_PATTERN.exec(value);
    const expression = match?.[1]?.trim();
    return expression || null;
}

export function isInterpolation(value: string): boolean {
    return parseInterpolation(value) !== null;
}

/** Returns every token expression, or null for unmatched/empty delimiters. */
export function interpolationExpressions(value: string): readonly string[] | null {
    const expressions: string[] = [];
    let cursor = 0;
    for (const match of value.matchAll(INTERPOLATION_TOKEN_PATTERN)) {
        const expression = match[1]?.trim() ?? "";
        const start = match.index ?? 0;
        if (!expression || /\{\{|\}\}/u.test(value.slice(cursor, start))) {
            return null;
        }
        expressions.push(expression);
        cursor = start + match[0].length;
    }
    return expressions.length > 0 && !/\{\{|\}\}/u.test(value.slice(cursor)) ? expressions : null;
}
