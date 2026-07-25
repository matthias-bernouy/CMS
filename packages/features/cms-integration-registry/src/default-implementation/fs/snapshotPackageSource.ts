import type {
    IntegrationPackageLimits,
    IntegrationPackageSource,
    ResolvedIntegrationPackage,
} from "@bernouy/cms-integration-packages";
import { readIntegrationPackageDirectory } from "@bernouy/cms-integration-packages/fs";
import type {
    IntegrationRegistryCatalogSnapshotProvider,
    IntegrationRegistryExactVersionLocation,
} from "../../interfaces/catalog";
import { readIntegrationRegistryVersionManifest } from "./manifest/reader";

export type SnapshotIntegrationPackageSourceConfig = Readonly<{
    snapshots: IntegrationRegistryCatalogSnapshotProvider;
    limits?: Partial<IntegrationPackageLimits>;
}>;

export class SnapshotIntegrationPackageSource implements IntegrationPackageSource {
    private readonly inFlight = new Map<string, Promise<ResolvedIntegrationPackage>>();

    constructor(private readonly config: SnapshotIntegrationPackageSourceConfig) {}

    async getPackage(kind: string, version: string): Promise<ResolvedIntegrationPackage | null> {
        const location = this.config.snapshots.current().locateExactVersion(kind, version);
        if (!location) {
            return null;
        }
        const existing = this.inFlight.get(location.package.digest);
        if (existing) {
            return await existing;
        }
        const pending = this.readPackage(location);
        this.inFlight.set(location.package.digest, pending);
        try {
            return await pending;
        } finally {
            if (this.inFlight.get(location.package.digest) === pending) {
                this.inFlight.delete(location.package.digest);
            }
        }
    }

    private async readPackage(location: IntegrationRegistryExactVersionLocation): Promise<ResolvedIntegrationPackage> {
        const manifest = location.manifestPath
            ? await readIntegrationRegistryVersionManifest({
                  path: location.manifestPath,
                  integrationRoot: location.integrationRoot,
                  expectedKind: location.kind,
                  expectedVersion: location.version,
                  limits: this.config.limits,
              })
            : null;
        if (location.manifestPath && !manifest) {
            throw new Error(
                `Integration package "${location.kind}@${location.version}" manifest disappeared after snapshot construction`,
            );
        }
        if (manifest && manifest.digest !== location.package.digest) {
            throw new Error(
                `Integration package "${location.kind}@${location.version}" manifest digest changed after snapshot construction`,
            );
        }
        const result = await readIntegrationPackageDirectory({
            root: location.packageRoot,
            definition: location.definition,
            ...(manifest?.envelope.releaseNotes
                ? { releaseNotes: manifest.envelope.releaseNotes }
                : location.releaseNotes
                  ? { releaseNotes: location.releaseNotes }
                  : {}),
            ...(!manifest && location.legacy ? { legacy: true as const } : {}),
            ...(manifest ? { expectedEnvelope: manifest.envelope } : {}),
            kind: location.kind,
            version: location.version,
            limits: this.config.limits,
        });
        if (result.digest !== location.package.digest) {
            throw new Error(
                `Integration package "${location.kind}@${location.version}" digest changed after catalog snapshot construction`,
            );
        }
        return result;
    }
}
