import { readdir, readFile } from "node:fs/promises";
import { parseIntegrationDefinition } from "../../core/parsing/definition";
import type { IntegrationDefinition } from "../../interfaces/Integration";
import type {
    IntegrationAsset,
    IntegrationDefinitionIndex,
    IntegrationDefinitionRepository,
    IntegrationDefinitionSummary,
    IntegrationDefinitionVersion,
} from "../../interfaces/IntegrationDefinitionRepository";
import { readIntegrationAsset } from "./assets";
import {
    assertPathWithin,
    isNodeError,
    parseIntegrationDefinitionIndex,
    resolveExistingPathWithin,
    resolveVersion,
} from "./repositorySupport";
import { hydrateVersionAssets } from "./versionAssets";

export type FsIntegrationDefinitionRepositoryConfig = {
    root: string;
    defaultChannel?: "stable" | "latest";
};

export class FsIntegrationDefinitionRepository implements IntegrationDefinitionRepository {
    private readonly root: string;
    private readonly defaultChannel: "stable" | "latest";

    constructor(config: string | FsIntegrationDefinitionRepositoryConfig) {
        this.root = typeof config === "string" ? config : config.root;
        this.defaultChannel = typeof config === "string" ? "stable" : (config.defaultChannel ?? "stable");
    }

    async list(): Promise<IntegrationDefinitionSummary[]> {
        const indexes = await this.readIndexes();
        return indexes
            .map((index) => ({
                kind: index.kind,
                label: index.label,
                ...(index.schema ? { schema: index.schema } : {}),
                ...(index.icon ? { icon: index.icon } : {}),
                ...(index.category ? { category: index.category } : {}),
                ...(index.description ? { description: index.description } : {}),
                ...(index.stable ? { stable: index.stable } : {}),
                ...(index.latest ? { latest: index.latest } : {}),
                versions: index.versions.map((version) => version.version),
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
        if (!index) {
            return null;
        }
        const entry = resolveVersion(index, version, this.defaultChannel);
        if (!entry) {
            return null;
        }

        const kindRoot = await this.resolveKindRoot(index.kind);
        const versionRoot = await resolveExistingPathWithin(kindRoot, "version", entry.path);
        const definitionPath = await resolveExistingPathWithin(kindRoot, "definition", entry.definition);
        assertPathWithin(versionRoot, definitionPath, "version", entry.definition);
        const parsed = JSON.parse(await readFile(definitionPath, "utf-8"));
        const definition = parseIntegrationDefinition(parsed);
        if (definition.kind !== index.kind) {
            throw new Error(
                `${definitionPath}: definition kind "${definition.kind}" does not match index kind "${index.kind}"`,
            );
        }
        if (definition.version !== entry.version) {
            throw new Error(
                `${definitionPath}: definition version "${definition.version ?? ""}" does not match index version "${entry.version}"`,
            );
        }
        return await hydrateVersionAssets(definition, versionRoot);
    }

    async getAsset(kind: string, version: string | undefined, path: string): Promise<IntegrationAsset | null> {
        const index = await this.readIndexOrNull(kind);
        if (!index) {
            return null;
        }
        const entry = resolveVersion(index, version, this.defaultChannel);
        if (!entry) {
            return null;
        }
        const versionRoot = await resolveExistingPathWithin(
            await this.resolveKindRoot(index.kind),
            "version",
            entry.path,
        );
        return await readIntegrationAsset(versionRoot, path);
    }

    private async readIndexes(): Promise<IntegrationDefinitionIndex[]> {
        const entries = await readdir(this.root, { withFileTypes: true });
        const indexes = await Promise.all(
            entries.filter((entry) => entry.isDirectory()).map((entry) => this.readIndexOrNull(entry.name)),
        );
        return indexes.filter((index): index is IntegrationDefinitionIndex => index !== null);
    }

    private async readIndexOrNull(kind: string): Promise<IntegrationDefinitionIndex | null> {
        try {
            return await this.readIndex(kind);
        } catch (e) {
            if (isNodeError(e) && e.code === "ENOENT") {
                return null;
            }
            throw e;
        }
    }

    private async readIndex(kind: string): Promise<IntegrationDefinitionIndex> {
        const indexPath = await resolveExistingPathWithin(
            await this.resolveKindRoot(kind),
            "repository",
            "integration.json",
        );
        const parsed = JSON.parse(await readFile(indexPath, "utf-8"));
        const index = parseIntegrationDefinitionIndex(parsed, indexPath);
        if (index.kind !== kind) {
            throw new Error(`${indexPath}: index kind "${index.kind}" does not match directory "${kind}"`);
        }
        return index;
    }

    private async resolveKindRoot(kind: string): Promise<string> {
        return await resolveExistingPathWithin(this.root, "repository", kind);
    }
}
