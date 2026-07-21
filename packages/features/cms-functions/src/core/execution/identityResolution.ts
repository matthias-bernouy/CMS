import { CMS_IDENTITY_AUTHORITY, type IdentityValue } from "@bernouy/cms-identities";
import type { DataShape, SourceEndpoint } from "@bernouy/cms-sources";
import type { CmsFunction, FunctionCall, FunctionValue } from "../../interfaces/FunctionDefinition";
import type { ExecuteFunctionOptions } from "../executeFunction";
import { FunctionExecutionError } from "../errors";
import { resolveFunctionValue, type FunctionRuntimeVars } from "../expressions";
import { referenceShape } from "./referenceShapes";

export async function resolveCallMappings(
    definition: CmsFunction,
    call: FunctionCall,
    endpoint: SourceEndpoint,
    vars: FunctionRuntimeVars,
    options: ExecuteFunctionOptions,
): Promise<{ params: Record<string, unknown>; body: unknown }> {
    const params: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(call.params ?? {})) {
        const target = endpoint.input?.params?.find((param) => param.name === name)?.schema;
        params[name] = await resolveMappedValue(value, target, definition, call, vars, options);
    }
    return {
        params,
        body: await resolveMappedValue(call.body, endpoint.input?.body, definition, call, vars, options),
    };
}

async function resolveMappedValue(
    value: FunctionValue | undefined,
    target: DataShape | undefined,
    definition: CmsFunction,
    call: FunctionCall,
    vars: FunctionRuntimeVars,
    options: ExecuteFunctionOptions,
): Promise<unknown> {
    if (typeof value === "string" && value.startsWith("$")) {
        const resolved = resolveFunctionValue(value, vars);
        return resolveIdentityReference(value, resolved, target, definition, call, options);
    }
    if (target?.semantic?.kind === "user-id" && value !== undefined) {
        throw new FunctionExecutionError("User identity mappings must reference a declared user-id field", 400);
    }
    if (isConcatExpression(value)) {
        return resolveFunctionValue(value, vars);
    }
    if (Array.isArray(value)) {
        return Promise.all(
            value.map((item) => resolveMappedValue(item, target?.items, definition, call, vars, options)),
        );
    }
    if (isRecord(value)) {
        const entries = await Promise.all(
            Object.entries(value).map(
                async ([key, item]) =>
                    [
                        key,
                        await resolveMappedValue(item, target?.properties?.[key], definition, call, vars, options),
                    ] as const,
            ),
        );
        return Object.fromEntries(entries);
    }
    return resolveFunctionValue(value, vars);
}

async function resolveIdentityReference(
    reference: string,
    value: unknown,
    target: DataShape | undefined,
    definition: CmsFunction,
    call: FunctionCall,
    options: ExecuteFunctionOptions,
): Promise<unknown> {
    if (target?.semantic?.kind !== "user-id") {
        return value;
    }
    if (!isIdentityValue(value)) {
        throw new FunctionExecutionError(`Identity reference "${reference}" is empty`, 409);
    }
    const source = await referenceShape(definition, reference, call, options);
    if (source?.semantic?.kind !== "user-id") {
        throw new FunctionExecutionError(`Reference "${reference}" is not declared as a user-id`, 400);
    }
    const sourceAuthority =
        source.semantic.authority ?? (reference === "$ctx.user.id" ? CMS_IDENTITY_AUTHORITY : undefined);
    const targetAuthority = target.semantic.authority;
    if (!sourceAuthority || !targetAuthority) {
        throw new FunctionExecutionError(`Identity mapping "${reference}" has no authority`, 500);
    }
    if (sourceAuthority === targetAuthority) {
        return value;
    }
    if (!options.identities) {
        throw new FunctionExecutionError("Identity resolver is not configured", 500);
    }
    const resolved = await options.identities.resolve(
        {
            authority: sourceAuthority,
            kind: "user",
            value,
        },
        targetAuthority,
    );
    if (resolved === null) {
        throw new FunctionExecutionError(
            `User identity is not linked from "${sourceAuthority}" to "${targetAuthority}"`,
            409,
        );
    }
    return resolved;
}

function isRecord(value: unknown): value is Record<string, FunctionValue> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isConcatExpression(value: unknown): value is { $concat: FunctionValue[] } {
    return isRecord(value) && Object.keys(value).length === 1 && Array.isArray(value.$concat);
}

function isIdentityValue(value: unknown): value is IdentityValue {
    return (typeof value === "string" && !!value.trim()) || (typeof value === "number" && Number.isFinite(value));
}
