import { parseIntegrationIcon } from "../../core/parsing/definition/icon";
import { assertExactIntegrationVersion, isIntegrationPrerelease } from "../../core/definitions/versioning";
import type {
    IntegrationDefinitionIndex,
    IntegrationDefinitionSummary,
    IntegrationDefinitionVersion,
} from "../../interfaces/IntegrationDefinitionRepository";

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
    const versions = parseVersions(value.versions);
    return {
        ...definitionMetadata(
            value,
            versions.map((entry) => entry.version),
        ),
        versions,
    };
}

export function parseVersions(value: unknown): IntegrationDefinitionVersion[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error("integration versions response must be a non-empty array");
    }
    const versions = value.map((entry) => {
        if (!isRecord(entry)) {
            throw new Error("integration version must be an object");
        }
        return {
            version: requiredVersion(entry.version, "version"),
            path: requiredText(entry.path, "path"),
            definition: requiredText(entry.definition, "definition"),
        };
    });
    if (new Set(versions.map((entry) => entry.version)).size !== versions.length) {
        throw new Error("integration versions response must not contain duplicate versions");
    }
    return versions;
}

function parseSummary(value: unknown): IntegrationDefinitionSummary {
    if (!isRecord(value)) {
        throw new Error("integration summary must be an object");
    }
    const versions = versionArray(value.versions, "versions");
    return { ...definitionMetadata(value, versions), versions };
}

function definitionMetadata(value: Record<string, unknown>, versions: readonly string[]) {
    const icon = parseIntegrationIcon(value.icon, "icon");
    const stable = repositoryChannel(value.stable, "stable", versions, true);
    const latest = repositoryChannel(value.latest, "latest", versions, false);
    return {
        kind: requiredText(value.kind, "kind"),
        label: requiredText(value.label, "label"),
        ...(text(value.schema) ? { schema: text(value.schema)! } : {}),
        ...(icon ? { icon } : {}),
        ...(text(value.category) ? { category: text(value.category)! } : {}),
        ...(text(value.description) ? { description: text(value.description)! } : {}),
        ...(stable ? { stable } : {}),
        ...(latest ? { latest } : {}),
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

function requiredVersion(value: unknown, name: string): string {
    if (typeof value !== "string" || !value) {
        throw new Error(`integration repository response missing ${name}`);
    }
    return assertExactIntegrationVersion(value, `integration repository response ${name}`);
}

function versionArray(value: unknown, name: string): string[] {
    if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string")) {
        throw new Error(`integration repository response ${name} must be a non-empty string array`);
    }
    const versions = value.map((version, index) =>
        assertExactIntegrationVersion(version, `integration repository response ${name}.${index}`),
    );
    if (new Set(versions).size !== versions.length) {
        throw new Error(`integration repository response ${name} must not contain duplicates`);
    }
    return versions;
}

function repositoryChannel(
    value: unknown,
    name: string,
    versions: readonly string[],
    stable: boolean,
): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== "string" || !value) {
        throw new Error(`integration repository response ${name} must be an exact SemVer 2.0 version`);
    }
    const channel = value;
    assertExactIntegrationVersion(channel, `integration repository response ${name}`);
    if (stable && isIntegrationPrerelease(channel)) {
        throw new Error(`integration repository response ${name} must not reference a prerelease version`);
    }
    if (!versions.includes(channel)) {
        throw new Error(`integration repository response ${name} must reference a listed version`);
    }
    return channel;
}
