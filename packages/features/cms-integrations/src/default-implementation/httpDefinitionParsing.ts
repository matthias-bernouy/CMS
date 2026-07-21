import { parseIntegrationIcon } from "../core/parsing/icon";
import type {
    IntegrationDefinitionIndex,
    IntegrationDefinitionSummary,
    IntegrationDefinitionVersion,
} from "../interfaces/IntegrationDefinitionRepository";

export function parseSummaries(value: unknown): IntegrationDefinitionSummary[] {
    if (!Array.isArray(value)) {
        throw new Error("integration summaries response must be an array");
    }
    return value.map(parseSummary);
}

export function parseIndex(value: unknown): IntegrationDefinitionIndex {
    if (!isRecord(value)) {
        throw new Error("integration index must be an object");
    }
    return {
        ...definitionMetadata(value),
        versions: parseVersions(value.versions),
    };
}

export function parseVersions(value: unknown): IntegrationDefinitionVersion[] {
    if (!Array.isArray(value)) {
        throw new Error("integration versions response must be an array");
    }
    return value.map((entry) => {
        if (!isRecord(entry)) {
            throw new Error("integration version must be an object");
        }
        return {
            version: requiredText(entry.version, "version"),
            path: requiredText(entry.path, "path"),
            definition: requiredText(entry.definition, "definition"),
        };
    });
}

function parseSummary(value: unknown): IntegrationDefinitionSummary {
    if (!isRecord(value)) {
        throw new Error("integration summary must be an object");
    }
    return {
        ...definitionMetadata(value),
        versions: stringArray(value.versions, "versions"),
    };
}

function definitionMetadata(value: Record<string, unknown>) {
    const icon = parseIntegrationIcon(value.icon, "icon");
    return {
        kind: requiredText(value.kind, "kind"),
        label: requiredText(value.label, "label"),
        ...(text(value.schema) ? { schema: text(value.schema)! } : {}),
        ...(icon ? { icon } : {}),
        ...(text(value.category) ? { category: text(value.category)! } : {}),
        ...(text(value.description) ? { description: text(value.description)! } : {}),
        ...(text(value.stable) ? { stable: text(value.stable)! } : {}),
        ...(text(value.latest) ? { latest: text(value.latest)! } : {}),
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredText(value: unknown, name: string): string {
    const result = text(value);
    if (!result) {
        throw new Error(`integration repository response missing ${name}`);
    }
    return result;
}

function stringArray(value: unknown, name: string): string[] {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        throw new Error(`integration repository response ${name} must be a string array`);
    }
    return value;
}
