import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { parseIntegrationDefinition } from "../core/parsing/definition";
import type { IntegrationDefinition } from "../interfaces/Integration";
import type {
    IntegrationDefinitionIndex,
    IntegrationDefinitionRepository,
    IntegrationDefinitionSummary,
    IntegrationDefinitionVersion,
} from "../interfaces/IntegrationDefinitionRepository";

export type FsIntegrationDefinitionRepositoryConfig = {
    root: string;
    defaultChannel?: "stable" | "latest";
};

export class FsIntegrationDefinitionRepository implements IntegrationDefinitionRepository {
    private readonly root: string;
    private readonly defaultChannel: "stable" | "latest";

    constructor(config: string | FsIntegrationDefinitionRepositoryConfig) {
        this.root = typeof config === "string" ? config : config.root;
        this.defaultChannel = typeof config === "string" ? "stable" : config.defaultChannel ?? "stable";
    }

    async list(): Promise<IntegrationDefinitionSummary[]> {
        const indexes = await this.readIndexes();
        return indexes
            .map(index => ({
                kind: index.kind,
                label: index.label,
                ...(index.schema ? { schema: index.schema } : {}),
                ...(index.category ? { category: index.category } : {}),
                ...(index.description ? { description: index.description } : {}),
                ...(index.stable ? { stable: index.stable } : {}),
                ...(index.latest ? { latest: index.latest } : {}),
                versions: index.versions.map(version => version.version),
            }))
            .sort((a, b) => a.kind.localeCompare(b.kind));
    }

    async getIndex(kind: string): Promise<IntegrationDefinitionIndex | null> {
        return await this.readIndexOrNull(kind);
    }

    async listVersions(kind: string): Promise<IntegrationDefinitionVersion[]> {
        return (await this.readIndexOrNull(kind))?.versions ?? [];
    }

    async get(kind: string, version?: string): Promise<IntegrationDefinition | null> {
        const index = await this.readIndexOrNull(kind);
        if (!index) return null;
        const entry = resolveVersion(index, version, this.defaultChannel);
        if (!entry) return null;

        const definitionPath = safeJoin(this.root, index.kind, entry.definition);
        const parsed = JSON.parse(await readFile(definitionPath, "utf-8"));
        const definition = parseIntegrationDefinition(parsed);
        if (definition.kind !== index.kind) {
            throw new Error(`${definitionPath}: definition kind "${definition.kind}" does not match index kind "${index.kind}"`);
        }
        if (definition.version !== entry.version) {
            throw new Error(`${definitionPath}: definition version "${definition.version ?? ""}" does not match index version "${entry.version}"`);
        }
        return definition;
    }

    private async readIndexes(): Promise<IntegrationDefinitionIndex[]> {
        const entries = await readdir(this.root, { withFileTypes: true });
        const indexes = await Promise.all(entries
            .filter(entry => entry.isDirectory())
            .map(entry => this.readIndex(entry.name)));
        return indexes;
    }

    private async readIndexOrNull(kind: string): Promise<IntegrationDefinitionIndex | null> {
        try {
            return await this.readIndex(kind);
        } catch (e) {
            if (isNodeError(e) && e.code === "ENOENT") return null;
            throw e;
        }
    }

    private async readIndex(kind: string): Promise<IntegrationDefinitionIndex> {
        const indexPath = safeJoin(this.root, kind, "integration.json");
        const parsed = JSON.parse(await readFile(indexPath, "utf-8"));
        const index = parseIntegrationDefinitionIndex(parsed, indexPath);
        if (index.kind !== kind) {
            throw new Error(`${indexPath}: index kind "${index.kind}" does not match directory "${kind}"`);
        }
        return index;
    }
}

function resolveVersion(
    index: IntegrationDefinitionIndex,
    requestedVersion: string | undefined,
    defaultChannel: "stable" | "latest",
): IntegrationDefinitionVersion | null {
    const target = requestedVersion ?? index[defaultChannel] ?? index.stable ?? index.latest;
    if (!target) return null;
    return index.versions.find(version => version.version === target) ?? null;
}

function parseIntegrationDefinitionIndex(value: unknown, source: string): IntegrationDefinitionIndex {
    if (!isRecord(value)) throw new Error(`${source}: integration index must be an object`);
    const kind = text(value.kind);
    const label = text(value.label);
    if (!kind) throw new Error(`${source}: kind is required`);
    if (!label) throw new Error(`${source}: label is required`);
    if (!Array.isArray(value.versions) || value.versions.length === 0) {
        throw new Error(`${source}: versions must be a non-empty array`);
    }
    return {
        ...(text(value.schema) ? { schema: text(value.schema)! } : {}),
        kind,
        label,
        ...(text(value.category) ? { category: text(value.category)! } : {}),
        ...(text(value.description) ? { description: text(value.description)! } : {}),
        ...(text(value.stable) ? { stable: text(value.stable)! } : {}),
        ...(text(value.latest) ? { latest: text(value.latest)! } : {}),
        versions: value.versions.map((entry, index) => parseVersion(entry, `${source}: versions.${index}`)),
    };
}

function parseVersion(value: unknown, source: string): IntegrationDefinitionVersion {
    if (!isRecord(value)) throw new Error(`${source} must be an object`);
    const version = text(value.version);
    const path = text(value.path);
    const definition = text(value.definition);
    if (!version) throw new Error(`${source}.version is required`);
    if (!path) throw new Error(`${source}.path is required`);
    if (!definition) throw new Error(`${source}.definition is required`);
    return { version, path, definition };
}

function safeJoin(root: string, ...parts: string[]): string {
    const base = resolve(root);
    const target = resolve(join(base, ...parts));
    const rel = relative(base, target);
    if (rel.startsWith("..") || isAbsolute(rel)) {
        throw new Error(`Path escapes integration repository root: ${parts.join("/")}`);
    }
    return target;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
