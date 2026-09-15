import type { LocalIntegrationRepository } from "../../../repository/local";
import type { LocalReleasePackage } from "../../types";

type ReleaseScenarioRepository = Pick<LocalIntegrationRepository, "store">;

export async function storeReleaseScenarioPackages(
    repository: ReleaseScenarioRepository,
    packages: readonly LocalReleasePackage[],
): Promise<void> {
    const unique = new Map(packages.map((entry) => [coordinate(entry), entry]));
    for (const entry of unique.values()) {
        await repository.store({
            package: entry.package,
            definition: entry.definition,
            ...(entry.verification ? { verification: entry.verification } : {}),
            ...(entry.reviewedSchemaBaselines ? { reviewedSchemaBaselines: entry.reviewedSchemaBaselines } : {}),
            source: "release-sandbox",
        });
    }
}

function coordinate(entry: LocalReleasePackage): string {
    return `${entry.package.envelope.kind}@${entry.package.envelope.version}`;
}
