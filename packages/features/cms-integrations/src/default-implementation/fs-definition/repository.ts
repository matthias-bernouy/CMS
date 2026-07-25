import { lstat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { assertExactIntegrationVersion } from "../../core/definitions/versioning";
import type { IntegrationDefinition } from "../../interfaces/Integration";
import type {
    IntegrationAsset,
    IntegrationDefinitionIndex,
    IntegrationDefinitionRepository,
    IntegrationDefinitionSummary,
    IntegrationDefinitionVersion,
} from "../../interfaces/IntegrationDefinitionRepository";
import { readIntegrationAsset } from "./assets";
import { loadIntegrationDefinitionFromVersionRoot } from "./definitionLoader";
import { IntegrationPackageLocator } from "./packageLocator";
import { assertPathWithin, isNodeError, resolveExistingPathWithin, resolveVersion } from "./repositorySupport";

export type FsIntegrationDefinitionRepositoryConfig = {
    root: string;
    defaultChannel?: "stable" | "latest";
};

export type FsIntegrationVersionLocation = {
    root: string;
    definition: string;
    releaseNotes?: string;
    legacy?: boolean;
};

export class FsIntegrationDefinitionRepository implements IntegrationDefinitionRepository {
    private readonly defaultChannel: "stable" | "latest";
    private readonly locator: IntegrationPackageLocator;

    constructor(config: string | FsIntegrationDefinitionRepositoryConfig) {
        this.locator = new IntegrationPackageLocator(typeof config === "string" ? config : config.root);
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
        return (await this.locator.get(kind))?.index ?? null;
    }

    async listVersions(kind: string): Promise<IntegrationDefinitionVersion[]> {
        return (await this.locator.get(kind))?.index.versions ?? [];
    }

    async get(kind: string, version?: string): Promise<IntegrationDefinition | null> {
        const locatedPackage = await this.locator.get(kind);
        if (!locatedPackage) {
            return null;
        }
        const { index } = locatedPackage;
        const entry = resolveVersion(index, version, this.defaultChannel);
        if (!entry) {
            return null;
        }

        const versionRoot = await resolveExistingPathWithin(locatedPackage.root, "version", entry.path);
        const definitionPath = await resolveExistingPathWithin(locatedPackage.root, "definition", entry.definition);
        assertPathWithin(versionRoot, definitionPath, "version", entry.definition);
        return await loadIntegrationDefinitionFromVersionRoot({
            definitionPath,
            expectedKind: index.kind,
            expectedVersion: entry.version,
            versionRoot,
        });
    }

    async getAsset(kind: string, version: string | undefined, path: string): Promise<IntegrationAsset | null> {
        const locatedPackage = await this.locator.get(kind);
        if (!locatedPackage) {
            return null;
        }
        const { index } = locatedPackage;
        const entry = resolveVersion(index, version, this.defaultChannel);
        if (!entry) {
            return null;
        }
        const versionRoot = await resolveExistingPathWithin(locatedPackage.root, "version", entry.path);
        return await readIntegrationAsset(versionRoot, path);
    }

    async locateExactVersion(kind: string, version: string): Promise<FsIntegrationVersionLocation | null> {
        assertExactIntegrationVersion(version, "version");
        if (!(await this.get(kind, version))) {
            return null;
        }
        const located = await this.locator.getVersion(kind, version);
        if (!located) {
            throw new Error(`Integration "${kind}" version "${version}" changed while locating its package`);
        }
        const definitionPath = await resolveExistingPathWithin(
            located.package.root,
            "definition",
            located.entry.definition,
        );
        assertPathWithin(located.root, definitionPath, "version", located.entry.definition);
        return {
            root: located.root,
            definition: relative(located.root, definitionPath).split(sep).join("/"),
            ...(await releaseNotesLocation(located.root)),
        };
    }

    private async readIndexes(): Promise<IntegrationDefinitionIndex[]> {
        return (await this.locator.list()).map((locatedPackage) => locatedPackage.index);
    }
}

async function releaseNotesLocation(
    versionRoot: string,
): Promise<Pick<FsIntegrationVersionLocation, "legacy" | "releaseNotes">> {
    const releaseNotes = "README.md";
    try {
        const stats = await lstat(join(versionRoot, releaseNotes));
        if (stats.isSymbolicLink() || !stats.isFile()) {
            throw new Error(`Integration release notes must be a regular file: ${join(versionRoot, releaseNotes)}`);
        }
        return { releaseNotes };
    } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
            return { legacy: true };
        }
        throw error;
    }
}
