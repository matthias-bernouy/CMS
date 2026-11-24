import type { CapabilityDefinition } from "ulvia-contracts/interfaces/ContractRelease";
import type { UlviaObjectSchema, UlviaSchema, UlviaSchemaReference } from "ulvia-contracts/interfaces/UlviaSchema";
import { canonicalizeIJson } from "ulvia-contracts/core/protocol/canonical";
import { ReleaseValidationError } from "ulvia-contracts/core/protocol/errors";
import { containsResolvedSchema } from "../traverse";

export function refusal(path: string, message: string): never {
    throw new ReleaseValidationError("invalid_contract", message, path);
}
export function referenceSchema(
    reference: UlviaSchemaReference,
    value: UlviaSchema,
    input: UlviaSchema | undefined,
    path: string,
) {
    let current: UlviaSchema | undefined = reference.source === "input" ? input : value;
    for (const name of reference.path
        .slice(1)
        .split("/")
        .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))) {
        if (!current || current.type !== "object" || current.nullable || !current.required.includes(name)) {
            refusal(path, "schema selector references must address required static object properties");
        }
        current = current.properties[name];
    }
    if (!current || containsResolvedSchema(current) || !jsonSchema(current)) {
        refusal(path, "schema selectors must be static JSON values");
    }
    return current;
}
export function jsonSchema(schema: UlviaSchema): boolean {
    if (schema.type === "binary") {
        return false;
    }
    if (schema.type === "object") {
        return Object.values(schema.properties).every(jsonSchema);
    }
    if (schema.type === "map") {
        return jsonSchema(schema.values);
    }
    if (schema.type === "array") {
        return jsonSchema(schema.items);
    }
    return true;
}
export function protocol(
    capability: CapabilityDefinition,
    input: UlviaObjectSchema,
    output: UlviaSchema,
    path: string,
) {
    if (
        capability.behavior.effect !== "query" ||
        capability.behavior.execution !== "sync" ||
        capability.responseEffects?.length ||
        canonicalizeIJson(capability.input) !== canonicalizeIJson(input) ||
        canonicalizeIJson(capability.output) !== canonicalizeIJson(output)
    ) {
        refusal(path, "schema resolvers and choices must implement their standard synchronous query protocol");
    }
}
