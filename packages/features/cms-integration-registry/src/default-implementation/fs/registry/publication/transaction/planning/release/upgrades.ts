import {
    identifyReleaseMigrationStateKey,
    identifyReleaseVerificationPlan,
    planReleaseVerification,
    type IntegrationVerificationEnvelopeV1,
} from "@bernouy/cms-integration-verification";
import {
    integrationVersionReleaseLevel,
    isIntegrationDefinitionVersionInstallable,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import type { IntegrationRegistryCatalogSnapshot } from "cms-integration-registry/interfaces/catalog";
import { FsIntegrationRegistryCandidateAdmissionPlanningError } from "../types";

export async function planCandidateReleaseVerification(input: {
    snapshot: IntegrationRegistryCatalogSnapshot;
    target: IntegrationDefinition;
    verification: IntegrationVerificationEnvelopeV1;
}) {
    const targetVersion = input.target.version;
    if (!targetVersion) {
        throw new FsIntegrationRegistryCandidateAdmissionPlanningError(
            "release_verification_plan_unavailable",
            "Candidate definition has no exact version",
        );
    }
    const index = input.snapshot.getIndex(input.target.kind);
    const versions = (index?.versions ?? []).filter(
        (entry) =>
            isIntegrationDefinitionVersionInstallable(entry) &&
            integrationVersionReleaseLevel(entry.version, targetVersion) !== null,
    );
    const baselines = await Promise.all(
        versions.map(async (entry) => {
            const location = input.snapshot.locateExactVersion(input.target.kind, entry.version);
            if (!location) {
                throw new FsIntegrationRegistryCandidateAdmissionPlanningError(
                    "catalog_changed",
                    `Upgrade baseline ${input.target.kind}@${entry.version} disappeared during planning`,
                );
            }
            return {
                version: entry.version,
                packageDigest: location.package.digest,
                resilienceKey: await identifyReleaseMigrationStateKey({
                    candidate: input.target,
                    baseline: location.definitionSnapshot,
                }),
            };
        }),
    );
    const fixtureScenarios = input.verification.manifest.upgradeFixture?.scenarios.map(({ name, from }) => ({
        name,
        from,
    }));
    try {
        return await identifyReleaseVerificationPlan(
            planReleaseVerification({
                baselines,
                ...(fixtureScenarios ? { fixtures: fixtureScenarios } : {}),
                hasMigrations: Boolean(input.target.connectors?.some((connector) => connector.migration)),
            }),
        );
    } catch (error) {
        throw new FsIntegrationRegistryCandidateAdmissionPlanningError(
            "release_verification_plan_unavailable",
            error instanceof Error ? error.message : "Release verification plan is invalid",
        );
    }
}
