import { compileHttpBinding } from "../bindings/compileHttpBinding";
import { canonicalizeIJson } from "../protocol/canonical";
import type { CapabilityDefinition, CapabilityErrorDefinition } from "../../interfaces/ContractRelease";
import type { UlviaSchema } from "../../interfaces/UlviaSchema";
import type { VersionBump } from "./semver";
import { firstSchemaSubsetViolation } from "./schemaAcceptance";
import { firstProjectedOutputViolation } from "./schema/projectedOutput";
import { compareRequirements } from "./compareRequirements";

export interface CapabilityChange {
    readonly code: "binding_changed" | "capability_changed" | "schema_changed";
    readonly message: string;
    readonly path: string;
    readonly requiredBump: VersionBump;
}

export function compareCapability(
    previous: CapabilityDefinition,
    next: CapabilityDefinition,
    path: string,
    maxJsonDepth: number,
): readonly CapabilityChange[] {
    const changes: CapabilityChange[] = [];
    if (previous.access !== next.access) {
        changes.push(major("capability_changed", `${path}.access`, "capability access changed"));
    }
    if (fingerprint(previous.behavior, maxJsonDepth) !== fingerprint(next.behavior, maxJsonDepth)) {
        changes.push(major("capability_changed", `${path}.behavior`, "capability behavior changed"));
    }
    changes.push(...compareRequirements(previous.requires ?? [], next.requires ?? [], `${path}.requires`));
    const inputChange = compareSchema(previous.input, next.input, `${path}.input`, "input", maxJsonDepth);
    if (inputChange) {
        changes.push(inputChange);
    }
    const outputChange = compareSchema(previous.output, next.output, `${path}.output`, "output", maxJsonDepth);
    if (outputChange) {
        changes.push(outputChange);
    }
    if (
        fingerprint(normalizeErrors(previous.errors), maxJsonDepth) !==
        fingerprint(normalizeErrors(next.errors), maxJsonDepth)
    ) {
        changes.push(major("capability_changed", `${path}.errors`, "declared errors changed"));
    }
    if (
        fingerprint(compileHttpBinding(previous), maxJsonDepth) !== fingerprint(compileHttpBinding(next), maxJsonDepth)
    ) {
        changes.push({
            code: "binding_changed",
            path: `${path}.binding`,
            message: "compiled HTTP binding changed",
            requiredBump: "minor",
        });
    }
    return changes;
}

function compareSchema(
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

function major(code: CapabilityChange["code"], path: string, message: string): CapabilityChange {
    return { code, path, message, requiredBump: "major" };
}

function normalizeErrors(errors: readonly CapabilityErrorDefinition[]): unknown {
    return [...errors]
        .sort((left, right) => (left.code < right.code ? -1 : left.code > right.code ? 1 : 0))
        .map(({ description: _, output, ...error }) => ({
            ...error,
            ...(output ? { output: normalizeSchema(output) } : {}),
        }));
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
        return key === "enum" || key === "mediaTypes" || key === "required" ? values.sort() : values;
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

function fingerprint(value: unknown, maxJsonDepth: number): string {
    return canonicalizeIJson(value, maxJsonDepth);
}
