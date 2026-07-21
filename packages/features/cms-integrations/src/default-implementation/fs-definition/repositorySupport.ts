import { realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseIntegrationIcon } from "../../core/parsing/icon";
import type {
    IntegrationDefinitionIndex,
    IntegrationDefinitionVersion,
} from "../../interfaces/IntegrationDefinitionRepository";

export function resolveVersion(
    index: IntegrationDefinitionIndex,
    requestedVersion: string | undefined,
    defaultChannel: "stable" | "latest",
): IntegrationDefinitionVersion | null {
    if (requestedVersion) {
        return index.versions.find((version) => version.version === requestedVersion) ?? null;
    }
    const target = index[defaultChannel] ?? index.stable ?? index.latest;
    if (!target) {
        return index.versions[0] ?? null;
    }
    return index.versions.find((version) => version.version === target) ?? null;
}

export function parseIntegrationDefinitionIndex(value: unknown, source: string): IntegrationDefinitionIndex {
    if (!isRecord(value)) {
        throw new Error(`${source}: integration index must be an object`);
    }
    const kind = text(value.kind);
    const label = text(value.label);
    if (!kind) {
        throw new Error(`${source}: kind is required`);
    }
    if (!label) {
        throw new Error(`${source}: label is required`);
    }
    if (!Array.isArray(value.versions) || value.versions.length === 0) {
        throw new Error(`${source}: versions must be a non-empty array`);
    }
    const icon = parseIntegrationIcon(value.icon, `${source}.icon`);
    return {
        ...(text(value.schema) ? { schema: text(value.schema)! } : {}),
        kind,
        label,
        ...(icon ? { icon } : {}),
        ...(text(value.category) ? { category: text(value.category)! } : {}),
        ...(text(value.description) ? { description: text(value.description)! } : {}),
        ...(text(value.stable) ? { stable: text(value.stable)! } : {}),
        ...(text(value.latest) ? { latest: text(value.latest)! } : {}),
        versions: value.versions.map((entry, index) => parseVersion(entry, `${source}: versions.${index}`)),
    };
}

export function safeJoin(root: string, ...parts: string[]): string {
    return safeJoinWithin(root, "repository", ...parts);
}

export function safeJoinWithin(root: string, boundary: string, ...parts: string[]): string {
    const base = resolve(root);
    const target = resolve(join(base, ...parts));
    const rel = relative(base, target);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        throw new Error(`Path escapes integration ${boundary} root: ${parts.join("/")}`);
    }
    return target;
}

export async function resolveExistingPathWithin(root: string, boundary: string, ...parts: string[]): Promise<string> {
    const canonicalRoot = await realpath(root);
    const target = await realpath(safeJoinWithin(canonicalRoot, boundary, ...parts));
    assertPathWithin(canonicalRoot, target, boundary, parts.join("/"));
    return target;
}

export function assertPathWithin(root: string, target: string, boundary: string, source: string): void {
    const rel = relative(root, target);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        throw new Error(`Path escapes integration ${boundary} root: ${source}`);
    }
}

export function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}

function parseVersion(value: unknown, source: string): IntegrationDefinitionVersion {
    if (!isRecord(value)) {
        throw new Error(`${source} must be an object`);
    }
    const version = text(value.version);
    const path = text(value.path);
    const definition = text(value.definition);
    if (!version) {
        throw new Error(`${source}.version is required`);
    }
    if (!path) {
        throw new Error(`${source}.path is required`);
    }
    if (!definition) {
        throw new Error(`${source}.definition is required`);
    }
    return { version, path, definition };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
