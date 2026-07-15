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
        input.body = projectShape(body, fn.input.body, "body");
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

function projectShape(value: unknown, shape: DataShape, path: string): unknown {
    if (value === null && shape.nullable === true) return null;
    if (shape.type === "object") {
        if (!isRecord(value)) throw new FunctionExecutionError(`${path} must be an object`, 400);
        for (const key of shape.required ?? []) {
            if (!Object.hasOwn(value, key)) throw new FunctionExecutionError(`${path}.${key} is required`, 400);
        }
        if (!shape.properties) return value;
        for (const key of Object.keys(value)) {
            if (!Object.hasOwn(shape.properties, key)) {
                throw new FunctionExecutionError(`${path}.${key} is not allowed`, 400);
            }
        }

        return Object.fromEntries(Object.entries(shape.properties)
            .filter(([key]) => Object.hasOwn(value, key))
            .map(([key, child]) => [key, projectShape(value[key], child, `${path}.${key}`)]));
    }
    if (shape.type === "array") {
        if (!Array.isArray(value)) throw new FunctionExecutionError(`${path} must be an array`, 400);
        if (!shape.items) return value;
        return value.map((item, index) => projectShape(item, shape.items!, `${path}.${index}`));
    }
    if (typeof value !== shape.type || (shape.type === "number" && !Number.isFinite(value))) {
        throw new FunctionExecutionError(`${path} must be a ${shape.type}`, 400);
    }
    return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
