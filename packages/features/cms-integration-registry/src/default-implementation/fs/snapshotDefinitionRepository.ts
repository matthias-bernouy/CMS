import { isAbsolute, relative, resolve, sep } from "node:path";
import type {
    IntegrationAsset,
    IntegrationDefinition,
    IntegrationDefinitionIndex,
    IntegrationDefinitionRepository,
    IntegrationDefinitionSummary,
    IntegrationDefinitionVersion,
} from "@bernouy/cms-integrations";
import { loadIntegrationDefinitionFromVersionRoot } from "@bernouy/cms-integrations/fs";
import type { IntegrationPackageSource } from "@bernouy/cms-integration-packages";
import type { IntegrationRegistryCatalogSnapshotProvider } from "../../interfaces/catalog";
import { readSnapshotIntegrationAsset } from "./asset";
import { SnapshotIntegrationPackageSource } from "./snapshotPackageSource";
import { resolveSnapshotVersion } from "./versionResolution";

export type SnapshotIntegrationDefinitionRepositoryConfig = Readonly<{
    snapshots: IntegrationRegistryCatalogSnapshotProvider;
    defaultChannel?: "stable" | "latest";
    packages?: IntegrationPackageSource;
}>;

export class SnapshotIntegrationDefinitionRepository implements IntegrationDefinitionRepository {
    private readonly defaultChannel: "stable" | "latest";
    private readonly packages: IntegrationPackageSource;

    constructor(private readonly config: SnapshotIntegrationDefinitionRepositoryConfig) {
        this.defaultChannel = config.defaultChannel ?? "stable";
        this.packages = config.packages ?? new SnapshotIntegrationPackageSource({ snapshots: config.snapshots });
    }

    async list(): Promise<IntegrationDefinitionSummary[]> {
        return [...this.config.snapshots.current().summaries];
    }

    async getIndex(kind: string): Promise<IntegrationDefinitionIndex | null> {
        return this.config.snapshots.current().getIndex(kind);
    }

    async listVersions(kind: string): Promise<IntegrationDefinitionVersion[]> {
        return [...this.config.snapshots.current().listVersions(kind)];
    }

    async get(kind: string, version?: string): Promise<IntegrationDefinition | null> {
        const snapshot = this.config.snapshots.current();
        const index = snapshot.getIndex(kind);
        if (!index) {
            return null;
        }
        const entry = resolveSnapshotVersion(index, version, this.defaultChannel);
        if (!entry) {
            return null;
        }
        const location = snapshot.locateExactVersion(kind, entry.version);
        if (!location) {
            throw new Error(`Catalog snapshot is missing exact location "${kind}@${entry.version}"`);
        }
        return await loadIntegrationDefinitionFromVersionRoot({
            definitionPath: definitionPath(location.packageRoot, location.definition),
            expectedKind: kind,
            expectedVersion: entry.version,
            versionRoot: location.packageRoot,
        });
    }

    async getAsset(kind: string, version: string | undefined, path: string): Promise<IntegrationAsset | null> {
        const snapshot = this.config.snapshots.current();
        const index = snapshot.getIndex(kind);
        if (!index) {
            return null;
        }
        const entry = resolveSnapshotVersion(index, version, this.defaultChannel);
        return entry ? await readSnapshotIntegrationAsset(this.packages, kind, entry.version, path) : null;
    }
}

function definitionPath(packageRoot: string, definition: string): string {
    const root = resolve(packageRoot);
    const path = resolve(root, definition);
    const rel = relative(root, path);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        throw new Error(`Definition path escapes integration version root: ${definition}`);
    }
    return path;
}
