export type RuntimeVars = {
    selection?: Record<string, unknown>;
    resource?: unknown;
    fields?: Record<string, unknown>;
    filters?: Record<string, unknown>;
    media?: unknown;
    value?: unknown;
    result?: unknown;
};

export function valueAt(value: unknown, path: string | undefined): unknown {
    if (!path) return value;
    return path.split(".").filter(Boolean).reduce((current, part) => {
        if (current === null || current === undefined) return undefined;
        if (Array.isArray(current) && /^\d+$/.test(part)) return current[Number(part)];
        if (typeof current !== "object") return undefined;
        return (current as Record<string, unknown>)[part];
    }, value);
}

export function textAt(value: unknown, path: string | undefined, fallback = ""): string {
    const found = valueAt(value, path);
    if (found === null || found === undefined) return fallback;
    if (typeof found === "string") return found;
    if (typeof found === "number" || typeof found === "boolean") return String(found);
    return fallback;
}

export function arrayAt(value: unknown, path: string | undefined): unknown[] {
    const found = valueAt(value, path);
    return Array.isArray(found) ? found : [];
}

export function resolveExpression(expression: string, vars: RuntimeVars): unknown {
    if (expression === "$search") return undefined;
    if (expression.startsWith("$selection.")) return valueAt(vars.selection, expression.slice("$selection.".length));
    if (expression.startsWith("$resource.")) return valueAt(vars.resource, expression.slice("$resource.".length));
    if (expression.startsWith("$field.")) return valueAt(vars.fields, expression.slice("$field.".length));
    if (expression.startsWith("$filter.")) return valueAt(vars.filters, expression.slice("$filter.".length));
    if (expression.startsWith("$media.")) return valueAt(vars.media, expression.slice("$media.".length));
    if (expression === "$result") return vars.result;
    if (expression.startsWith("$result.")) return valueAt(vars.result, expression.slice("$result.".length));
    if (expression === "$value") return vars.value;
    if (expression.startsWith("$value.")) return valueAt(vars.value, expression.slice("$value.".length));
    return expression;
}

export function resolveParams(params: Record<string, string> | undefined, vars: RuntimeVars): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, expression] of Object.entries(params ?? {})) {
        const value = resolveExpression(expression, vars);
        if (value === undefined || value === null || value === "") continue;
        out[key] = String(value);
    }
    return out;
}

export function resolveBody(body: Record<string, string> | undefined, vars: RuntimeVars): Record<string, unknown> | undefined {
    if (!body) return undefined;
    const out: Record<string, unknown> = {};
    for (const [key, expression] of Object.entries(body)) {
        const value = resolveExpression(expression, vars);
        if (value === undefined) continue;
        out[key] = value;
    }
    return out;
}

export function pathLabel(path: string): string {
    return path
        .split(".")
        .filter(Boolean)
        .at(-1)
        ?.replace(/[_-]+/g, " ")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2") ?? path;
}
