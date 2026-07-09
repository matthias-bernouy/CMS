import type { DataShape } from "@bernouy/cms-sources";
import type { CmsFunction } from "../../interfaces/FunctionDefinition";
import { FunctionExecutionError } from "../errors";
import type { FunctionRuntimeVars } from "../expressions";

export async function readFunctionInput(
    fn: CmsFunction,
    request: Request,
): Promise<NonNullable<FunctionRuntimeVars["input"]>> {
    const url = new URL(request.url);
    const params: Record<string, unknown> = {};
    for (const [name, shape] of Object.entries(fn.input?.params ?? {})) {
        const raw = url.searchParams.get(name);
        if (raw !== null) params[name] = coerceParam(raw, shape, `params.${name}`);
    }

    const input: NonNullable<FunctionRuntimeVars["input"]> = { params };
    if (fn.input?.body && request.method !== "GET" && request.body !== null) {
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            throw new FunctionExecutionError("Invalid JSON body", 400);
        }
        assertShape(body, fn.input.body, "body");
        input.body = body;
    }
    return input;
}

function coerceParam(value: string, shape: DataShape, path: string): unknown {
    if (shape.type === "number") {
        const next = Number(value);
        if (!Number.isFinite(next)) throw new FunctionExecutionError(`${path} must be a number`, 400);
        return next;
    }
    if (shape.type === "boolean") {
        if (value === "true" || value === "1") return true;
        if (value === "false" || value === "0") return false;
        throw new FunctionExecutionError(`${path} must be a boolean`, 400);
    }
    return value;
}

function assertShape(value: unknown, shape: DataShape, path: string): void {
    if (shape.type === "object") {
        if (!isRecord(value)) throw new FunctionExecutionError(`${path} must be an object`, 400);
        for (const key of shape.required ?? []) {
            if (!Object.hasOwn(value, key)) throw new FunctionExecutionError(`${path}.${key} is required`, 400);
        }
        for (const [key, child] of Object.entries(shape.properties ?? {})) {
            if (Object.hasOwn(value, key)) assertShape(value[key], child, `${path}.${key}`);
        }
        return;
    }
    if (shape.type === "array") {
        if (!Array.isArray(value)) throw new FunctionExecutionError(`${path} must be an array`, 400);
        if (shape.items) value.forEach((item, index) => assertShape(item, shape.items!, `${path}.${index}`));
        return;
    }
    if (typeof value !== shape.type) throw new FunctionExecutionError(`${path} must be a ${shape.type}`, 400);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
