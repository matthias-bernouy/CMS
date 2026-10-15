import type {
    BindingCapabilityError,
    BindingQueryCapability,
    BindingValueSchema,
} from "@bernouy/cms-content/page-document";
import type { CapabilityDefinition } from "cms-repository/exports/contracts/index";
import { CollectionValidationError } from "../../errors";

export function mergeQueryCapabilities(
    contractId: string,
    capabilityId: string,
    capabilities: readonly (CapabilityDefinition | undefined)[],
    path: string,
): BindingQueryCapability {
    return mergeCapabilities(contractId, capabilityId, capabilities, "query", path);
}

export function mergeMutationCapabilities(
    contractId: string,
    capabilityId: string,
    capabilities: readonly (CapabilityDefinition | undefined)[],
    path: string,
): BindingQueryCapability {
    return mergeCapabilities(contractId, capabilityId, capabilities, "command", path);
}

function mergeCapabilities(
    contractId: string,
    capabilityId: string,
    capabilities: readonly (CapabilityDefinition | undefined)[],
    effect: "query" | "command",
    path: string,
): BindingQueryCapability {
    const present = capabilities.filter((capability): capability is CapabilityDefinition => capability !== undefined);
    if (present.length !== capabilities.length || present.length === 0) {
        throw incompatible(contractId, capabilityId, "is not available in every compatible release", path);
    }
    if (present.some((capability) => capability.behavior.effect !== effect || capability.output.type === "binary")) {
        throw incompatible(contractId, capabilityId, `is not a structured ${effect} in every compatible release`, path);
    }
    return {
        contractId,
        capabilityId,
        input: intersectSchemas(
            present.map((capability) => capability.input),
            `${contractId}:${capabilityId}.input`,
            path,
        ),
        output: intersectSchemas(
            present.map((capability) => capability.output),
            `${contractId}:${capabilityId}.output`,
            path,
        ),
        errors: mergeErrors(present, `${contractId}:${capabilityId}`, path),
        variants: present.map((capability) => ({
            input: capability.input,
            output: capability.output,
            errors: capability.errors,
        })),
    };
}

function mergeErrors(
    capabilities: readonly CapabilityDefinition[],
    target: string,
    path: string,
): readonly BindingCapabilityError[] {
    const codes = new Set(capabilities.flatMap((capability) => capability.errors.map(({ code }) => code)));
    return [...codes].sort().map((code) => {
        const definitions = capabilities.flatMap((capability) =>
            capability.errors.filter((error) => error.code === code),
        );
        const outputs = definitions.map(({ output }) => output);
        return {
            code,
            retryable: definitions.every(({ retryable }) => retryable),
            ...(outputs.every((output) => output !== undefined)
                ? { output: intersectSchemas(outputs as BindingValueSchema[], `${target}.errors.${code}.output`, path) }
                : {}),
        };
    });
}

function intersectSchemas(schemas: readonly BindingValueSchema[], target: string, path: string): BindingValueSchema {
    const type = schemas[0]?.type;
    if (!type || schemas.some((schema) => schema.type !== type)) {
        throw new CollectionValidationError(
            "resolution_failed",
            `${target} has incompatible schema types across accepted releases`,
            path,
        );
    }
    const nullable = schemas.some((schema) => "nullable" in schema && schema.nullable)
        ? ({ nullable: true } as const)
        : {};
    if (type === "object") {
        const objects = schemas as Extract<BindingValueSchema, { type: "object" }>[];
        const names = Object.keys(objects[0]!.properties).filter((name) =>
            objects.every((schema) => schema.properties[name] !== undefined),
        );
        return {
            type,
            ...nullable,
            properties: Object.fromEntries(
                names.map((name) => [
                    name,
                    intersectSchemas(
                        objects.map((schema) => schema.properties[name]!),
                        `${target}.${name}`,
                        path,
                    ),
                ]),
            ),
            required: names.filter((name) => objects.every((schema) => schema.required.includes(name))),
        };
    }
    if (type === "array") {
        const arrays = schemas as Extract<BindingValueSchema, { type: "array" }>[];
        const minItems = Math.min(...arrays.map((schema) => schema.minItems ?? 0));
        return {
            type,
            ...nullable,
            items: intersectSchemas(
                arrays.map((schema) => schema.items),
                `${target}.items`,
                path,
            ),
            ...(minItems > 0 ? { minItems } : {}),
        };
    }
    if (type === "map") {
        const maps = schemas as Extract<BindingValueSchema, { type: "map" }>[];
        return {
            type,
            ...nullable,
            values: intersectSchemas(
                maps.map((schema) => schema.values),
                `${target}.*`,
                path,
            ),
        };
    }
    if (type === "string") {
        const strings = schemas as Extract<BindingValueSchema, { type: "string" }>[];
        const enumValues = strings.every((schema) => schema.enum)
            ? [...new Set(strings.flatMap((schema) => schema.enum ?? []))].sort()
            : undefined;
        return { type, ...nullable, ...(enumValues ? { enum: enumValues } : {}) };
    }
    return { type, ...nullable } as BindingValueSchema;
}

function incompatible(
    contractId: string,
    capabilityId: string,
    message: string,
    path: string,
): CollectionValidationError {
    return new CollectionValidationError("resolution_failed", `${contractId}:${capabilityId} ${message}`, path);
}
