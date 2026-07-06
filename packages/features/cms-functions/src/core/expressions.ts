import type { FunctionValue } from "../interfaces/FunctionDefinition";

export type FunctionRuntimeVars = {
    input?: {
        params?: Record<string, unknown>;
        body?: unknown;
    };
    ctx?: {
        user?: {
            id?: string;
            role?: string;
        };
    };
    steps?: Record<string, unknown>;
};

export function resolveFunctionValue(value: FunctionValue | undefined, vars: FunctionRuntimeVars): unknown {
    if (typeof value === "string" && value.startsWith("$")) return resolveReference(value, vars);
    if (Array.isArray(value)) return value.map(item => resolveFunctionValue(item, vars));
    if (isRecord(value)) {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveFunctionValue(item, vars)]));
    }
    return value;
}

export function resolveReference(ref: string, vars: FunctionRuntimeVars): unknown {
    if (ref === "$input") return vars.input;
    if (ref === "$ctx") return vars.ctx;
    if (ref === "$steps") return vars.steps;
    if (ref.startsWith("$input.params.")) return valueAt(vars.input?.params, ref.slice("$input.params.".length));
    if (ref.startsWith("$input.body.")) return valueAt(vars.input?.body, ref.slice("$input.body.".length));
    if (ref === "$input.body") return vars.input?.body;
    if (ref.startsWith("$ctx.user.")) return valueAt(vars.ctx?.user, ref.slice("$ctx.user.".length));
    if (ref.startsWith("$steps.")) return valueAt(vars.steps, ref.slice("$steps.".length));
    return undefined;
}

export function valueAt(value: unknown, path: string | undefined): unknown {
    if (!path) return value;
    return path.split(".").filter(Boolean).reduce((current, part) => {
        if (current === null || current === undefined) return undefined;
        if (Array.isArray(current) && /^\d+$/.test(part)) return current[Number(part)];
        if (typeof current !== "object") return undefined;
        return (current as Record<string, unknown>)[part];
    }, value);
}

export function collectReferences(value: unknown): string[] {
    const refs: string[] = [];
    visit(value, refs);
    return refs;
}

function visit(value: unknown, refs: string[]): void {
    if (typeof value === "string" && value.startsWith("$")) {
        refs.push(value);
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) visit(item, refs);
        return;
    }
    if (isRecord(value)) {
        for (const item of Object.values(value)) visit(item, refs);
    }
}

function isRecord(value: unknown): value is Record<string, FunctionValue> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
