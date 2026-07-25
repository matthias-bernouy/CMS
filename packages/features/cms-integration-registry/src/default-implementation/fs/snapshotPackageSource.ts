import type {
    IntegrationPackageLimits,
    IntegrationPackageSource,
    ResolvedIntegrationPackage,
} from "@bernouy/cms-integration-packages";
import { readIntegrationPackageDirectory } from "@bernouy/cms-integration-packages/fs";
import type { IntegrationRegistryCatalogSnapshotProvider } from "../../interfaces/catalog";

export type SnapshotIntegrationPackageSourceConfig = Readonly<{
    snapshots: IntegrationRegistryCatalogSnapshotProvider;
    limits?: Partial<IntegrationPackageLimits>;
}>;

export class SnapshotIntegrationPackageSource implements IntegrationPackageSource {
    private readonly packages = new Map<string, Promise<ResolvedIntegrationPackage>>();

    constructor(private readonly config: SnapshotIntegrationPackageSourceConfig) {}

    async getPackage(kind: string, version: string): Promise<ResolvedIntegrationPackage | null> {
        const location = this.config.snapshots.current().locateExactVersion(kind, version);
        if (!location) {
            return null;
        }
        const existing = this.packages.get(location.package.digest);
        if (existing) {
            return await existing;
        }
        const pending = readIntegrationPackageDirectory({
            root: location.packageRoot,
            definition: location.definition,
            ...(location.releaseNotes ? { releaseNotes: location.releaseNotes } : {}),
            ...(location.legacy ? { legacy: true } : {}),
            kind,
            version,
            limits: this.config.limits,
        }).then((result) => {
            if (result.digest !== location.package.digest) {
                throw new Error(
                    `Integration package "${kind}@${version}" digest changed after catalog snapshot construction`,
                );
            }
            return result;
        });
        this.packages.set(location.package.digest, pending);
        try {
            return await pending;
        } catch (error) {
            if (this.packages.get(location.package.digest) === pending) {
                this.packages.delete(location.package.digest);
            }
            throw error;
        }
    }
}
