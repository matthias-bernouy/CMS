import { buildOfficialIntegrationPackages } from "@bernouy/cms-official-integrations/publication";
import type { MigrationPackageFixture } from "../packages";

type BuiltOfficialPackages = Awaited<ReturnType<typeof buildOfficialIntegrationPackages>>;
type BuiltOfficialPackage = BuiltOfficialPackages[number];

export type OfficialPhotoAlbumsRelease = MigrationPackageFixture &
    Readonly<{
        dependencyPackage: BuiltOfficialPackage;
        sourcePackage: BuiltOfficialPackage;
        targetPackage: BuiltOfficialPackage;
    }>;

export async function loadOfficialPhotoAlbumsRelease(): Promise<OfficialPhotoAlbumsRelease> {
    const packages = await buildOfficialIntegrationPackages();
    const dependencyPackage = requiredPackage(packages, "basic-blocs", "1.0.0");
    const source = requiredPackage(packages, "photo-albums", "1.0.0");
    const target = requiredPackage(packages, "photo-albums", "1.1.0");
    const connector = target.definition.connectors?.find(({ provider }) => provider === "supabase");
    if (
        !connector?.connectorKey ||
        !connector.lineageId ||
        connector.migrationRevision === undefined ||
        !connector.migration
    ) {
        throw new Error("Official Photo Albums target connector is not migration-aware");
    }
    const sourceMapping = connector.migration.supportedSources.find(
        ({ legacyAdoption }) =>
            legacyAdoption?.definitionVersion === source.version && legacyAdoption.packageDigest === source.digest,
    );
    if (!sourceMapping) {
        throw new Error("Official Photo Albums source is not bound by exact legacy adoption");
    }
    return {
        source: { digest: source.digest, envelope: source.package.envelope },
        target: { digest: target.digest, envelope: target.package.envelope },
        targetPlan: connector.migration,
        connectorKey: connector.connectorKey,
        lineageId: connector.lineageId,
        sourceMigrationRevision: sourceMapping.migrationRevision,
        targetMigrationRevision: connector.migrationRevision,
        dependencyPackage,
        sourcePackage: source,
        targetPackage: target,
    };
}

function requiredPackage(packages: BuiltOfficialPackages, kind: string, version: string): BuiltOfficialPackage {
    const value = packages.find(
        ({ kind: candidateKind, version: candidateVersion }) => candidateKind === kind && candidateVersion === version,
    );
    if (!value) {
        throw new Error(`Official ${kind} ${version} package is missing`);
    }
    return value;
}
