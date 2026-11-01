import { canonicalizeIJson } from "../../protocol/canonical";
import type { UlviaSchema } from "../../../interfaces/UlviaSchema";
import { firstSchemaSubsetViolation } from "../schemaAcceptance";
import { firstProjectedOutputViolation } from "../schema/projectedOutput";
import { major, type CapabilityChange } from "./changes";

export function compareSchema(
    previous: UlviaSchema,
    next: UlviaSchema,
    path: string,
    direction: "input" | "output",
    maxJsonDepth: number,
): CapabilityChange | null {
    if (fingerprint(normalizeSchema(previous), maxJsonDepth) === fingerprint(normalizeSchema(next), maxJsonDepth)) {
        return null;
    }
    const acceptedBefore = direction === "input" ? previous : next;
    const acceptedAfter = direction === "input" ? next : previous;
    const breakingPath =
        direction === "output"
            ? firstProjectedOutputViolation(next, previous, path)
            : firstSchemaSubsetViolation(acceptedBefore, acceptedAfter, path);
    if (breakingPath) {
        return major("schema_changed", breakingPath, `${direction} schema is not proven backward-compatible`);
    }
    const changedPath =
        firstSchemaSubsetViolation(acceptedAfter, acceptedBefore, path) ??
        firstSchemaSubsetViolation(acceptedBefore, acceptedAfter, path);
    if (!changedPath) {
        return null;
    }
    return {
        code: "schema_changed",
        path: changedPath,
        message: `${direction} schema changed compatibly`,
        requiredBump: "minor",
    };
}

function normalizeSchema(schema: UlviaSchema): unknown {
    const { description: _, ...definition } = schema;
    switch (schema.type) {
        case "array":
            return normalize({ ...definition, items: normalizeSchema(schema.items) });
        case "map":
            return normalize({ ...definition, values: normalizeSchema(schema.values) });
        case "object":
            return normalize({
                ...definition,
                properties: Object.fromEntries(
                    Object.entries(schema.properties).map(([name, property]) => [name, normalizeSchema(property)]),
                ),
            });
        default:
            return normalize(definition);
    }
}

function normalize(value: unknown, key?: string): unknown {
    if (Array.isArray(value)) {
        const values = value.map((item) => normalize(item));
        return key === "enum" || key === "required" ? values.sort() : values;
    }
    if (value === null || typeof value !== "object") {
        return value;
    }
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [name, child] of Object.entries(value)) {
        result[name] = normalize(child, name);
    }
    return result;
}

export function fingerprint(value: unknown, maxJsonDepth: number): string {
    return canonicalizeIJson(value, maxJsonDepth);
}
