import { realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseIntegrationIcon } from "../../core/parsing/definition/icon";
import {
    resolveExactIntegrationDefinitionVersion,
    resolveInstallableIntegrationDefinitionVersion,
} from "../../core/definitions/repositoryVersions";
import { assertExactIntegrationVersion, isIntegrationPrerelease } from "../../core/definitions/versioning";
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
        return resolveExactIntegrationDefinitionVersion(index, requestedVersion);
    }
    return resolveInstallableIntegrationDefinitionVersion(index, undefined, defaultChannel);
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
    const versions = value.versions.map((entry, index) => parseVersion(entry, `${source}: versions.${index}`));
    const stable = parseChannel(value.stable, `${source}: stable`, versions, true);
    const latest = parseChannel(value.latest, `${source}: latest`, versions, false);
    return {
        ...(text(value.schema) ? { schema: text(value.schema)! } : {}),
        kind,
        label,
        ...(icon ? { icon } : {}),
        ...(text(value.category) ? { category: text(value.category)! } : {}),
        ...(text(value.description) ? { description: text(value.description)! } : {}),
        ...(stable ? { stable } : {}),
        ...(latest ? { latest } : {}),
        versions,
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
    const version = value.version;
    const path = text(value.path);
    const definition = text(value.definition);
    if (typeof version !== "string" || !version) {
        throw new Error(`${source}.version is required`);
    }
    if (!path) {
        throw new Error(`${source}.path is required`);
    }
    if (!definition) {
        throw new Error(`${source}.definition is required`);
    }
    const status = parseVersionStatus(value.status, `${source}.status`);
    const verificationDigest = parseDigest(value.verificationDigest, `${source}.verificationDigest`);
    return {
        version: assertExactIntegrationVersion(version, `${source}.version`),
        path,
        definition,
        ...(verificationDigest ? { verificationDigest } : {}),
        ...(status ? { status } : {}),
    };
}

function parseDigest(value: unknown, source: string): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
        throw new Error(`${source} must be lowercase SHA-256 when present`);
    }
    return value;
}

function parseVersionStatus(value: unknown, source: string): IntegrationDefinitionVersion["status"] {
    if (value === undefined) {
        return undefined;
    }
    if (value !== "blocked" && value !== "inadmissible" && value !== "unverified") {
        throw new Error(`${source} must be blocked, inadmissible, or unverified when present`);
    }
    return value;
}

function parseChannel(
    value: unknown,
    source: string,
    versions: readonly IntegrationDefinitionVersion[],
    stable: boolean,
): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== "string" || !value) {
        throw new Error(`${source} must be an exact SemVer 2.0 version`);
    }
    const channel = value;
    assertExactIntegrationVersion(channel, source);
    if (stable && isIntegrationPrerelease(channel)) {
        throw new Error(`${source} must not reference a prerelease version`);
    }
    if (!versions.some((entry) => entry.version === channel)) {
        throw new Error(`${source} must reference a listed version`);
    }
    return channel;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
