import { createHash } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import type { CapabilityDefinition } from "@bernouy/ulvia-contracts";

/** Test evidence excludes documentation only; access, behavior, schemas, tools and HTTP mappings remain exact. */
export function apiSignature(capability: CapabilityDefinition): string {
    const value = structuredClone(capability) as unknown as Record<string, unknown>;
    delete value.description;
    delete value.docs;
    for (const binding of value.bindings as Record<string, unknown>[]) {
        if (binding.tool && typeof binding.tool === "object") {
            delete (binding.tool as Record<string, unknown>).description;
        }
    }
    return createHash("sha256")
        .update(canonicalizeIJson(schemaDocumentation(value)))
        .digest("hex");
}

function schemaDocumentation(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(schemaDocumentation);
    }
    if (!value || typeof value !== "object") {
        return value;
    }
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
        Object.entries(record)
            .filter(([key]) => key !== "description" || typeof record.type !== "string")
            .map(([key, child]) => [key, schemaDocumentation(child)]),
    );
}
