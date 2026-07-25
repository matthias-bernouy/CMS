import { integrationVersionSatisfies } from "../../definitions/versioning";
import { IntegrationInputError } from "../../errors";
import type { IntegrationInstallationRepository } from "../../../interfaces/IntegrationInstallationRepository";

export async function assertUpgradePreservesDependentRanges(
    installations: IntegrationInstallationRepository,
    integrationId: string,
    targetVersion: string,
): Promise<void> {
    for (const dependent of await installations.list()) {
        if (dependent.id === integrationId || dependent.status !== "success" || !dependent.definitionSnapshot) {
            continue;
        }
        for (const dependency of dependent.definitionSnapshot.dependencies ?? []) {
            if (
                dependency.kind === integrationId &&
                dependency.versionRange &&
                !integrationVersionSatisfies(targetVersion, dependency.versionRange)
            ) {
                throw new IntegrationInputError(
                    "version",
                    `cannot upgrade integration "${integrationId}" to "${targetVersion}": installed integration "${dependent.id}" requires "${dependency.versionRange}"`,
                );
            }
        }
    }
}
