import { parseIntegrationDefinition } from "../../core/parsing/definition/definition";
import { isExactIntegrationVersion } from "../../core/definitions/versioning";
import type { IntegrationDefinition } from "../../interfaces/Integration";
import type {
    IntegrationAsset,
    IntegrationDefinitionIndex,
    IntegrationDefinitionRepository,
    IntegrationDefinitionSummary,
    IntegrationDefinitionVersion,
} from "../../interfaces/IntegrationDefinitionRepository";
import { readIntegrationAsset } from "./assets";
import { enrichDefinitionError } from "./definition-bundle/provenance";
import { resolveIntegrationDefinitionFileDetails } from "./definition-bundle/resolver";
import { IntegrationPackageLocator } from "./packageLocator";
import { assertPathWithin, resolveExistingPathWithin, resolveVersion } from "./repositorySupport";
import { hydrateVersionAssets } from "./versionAssets";

export type FsIntegrationDefinitionRepositoryConfig = {
    root: string;
    defaultChannel?: "stable" | "latest";
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
        const resolved = await resolveIntegrationDefinitionFileDetails(definitionPath, versionRoot);
        let definition: IntegrationDefinition;
        try {
            assertRawDefinitionVersion(resolved.value, entry.version);
            definition = parseIntegrationDefinition(resolved.value);
            if (definition.kind !== index.kind) {
                throw new Error(
                    `definition.kind: definition kind "${definition.kind}" does not match index kind "${index.kind}"`,
                );
            }
            if (definition.version !== entry.version) {
                throw new Error(
                    `definition.version: definition version "${definition.version ?? ""}" does not match index version "${entry.version}"`,
                );
            }
        } catch (error) {
            throw enrichDefinitionError(error, resolved.provenance, resolved.versionRoot);
        }
        return await hydrateVersionAssets(definition, versionRoot);
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

    private async readIndexes(): Promise<IntegrationDefinitionIndex[]> {
        return (await this.locator.list()).map((locatedPackage) => locatedPackage.index);
    }
}

function assertRawDefinitionVersion(value: unknown, expectedVersion: string): void {
    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        !("version" in value) ||
        typeof value.version !== "string" ||
        !isExactIntegrationVersion(value.version) ||
        value.version !== expectedVersion
    ) {
        throw new Error(`definition.version: definition version must exactly match index version "${expectedVersion}"`);
    }
}
