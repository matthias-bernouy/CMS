import {
    integrationVersionSatisfies,
    type IntegrationDefinition,
    type IntegrationInstallation,
} from "@bernouy/cms-integrations";
import type { RequiredMigrationEvidence } from "@bernouy/cms-integration-verification";
import type { IntegrationUpgradeMigrationEvidence, IntegrationUpgradeTarget } from "./contracts";

export function migrationRequirements(
    installation: IntegrationInstallation,
    definition: IntegrationDefinition | null,
): RequiredMigrationEvidence[] {
    const packageDigest = installation.packageDigest;
    if (!packageDigest) {
        return [];
    }
    return (definition?.connectors ?? []).flatMap((connector) => {
        if (!connector.migration || !connector.connectorKey || !connector.lineageId) {
            return [];
        }
        return [
            {
                source: {
                    kind: installation.id,
                    version: installation.definitionVersion,
                    packageDigest,
                },
                connectorKey: connector.connectorKey,
                lineageId: connector.lineageId,
            },
        ];
    });
}

export function verifiedMigrations(
    installation: IntegrationInstallation,
    definition: IntegrationDefinition,
    reports: readonly IntegrationUpgradeMigrationEvidence[],
): IntegrationUpgradeTarget["migrations"] {
    if (!installation.packageDigest) {
        return [];
    }
    return (definition.connectors ?? []).flatMap((connector) => {
        if (!connector.connectorKey || !connector.lineageId || !connector.migration) {
            return [];
        }
        const source = connector.migration.supportedSources.find((candidate) =>
            integrationVersionSatisfies(installation.definitionVersion, candidate.range),
        );
        if (!source) {
            return [];
        }
        const report = reports.find(
            (candidate) =>
                candidate.outcome === "passed" &&
                candidate.source.kind === installation.id &&
                candidate.source.version === installation.definitionVersion &&
                candidate.source.packageDigest === installation.packageDigest &&
                candidate.connectorKey === connector.connectorKey &&
                candidate.lineageId === connector.lineageId &&
                candidate.migrationRevision === connector.migrationRevision &&
                integrationVersionSatisfies(installation.definitionVersion, candidate.supportedSourceRange),
        );
        if (!report) {
            return [];
        }
        const operational = report.operationalEvidence;
        const cmsDrainSeconds = operational?.drain.cmsMediatedSeconds ?? connector.migration.cmsMediated?.drainSeconds;
        const providerDrainSeconds =
            operational?.drain.providerDirectSeconds ?? connector.migration.providerDirect?.drainSeconds;
        return [
            {
                connectorKey: report.connectorKey,
                lineageId: report.lineageId,
                supportedSourceRange: report.supportedSourceRange,
                reportId: report.reportId,
                reportDigest: report.reportDigest,
                runner: `${report.runner.name} ${report.runner.version}`,
                environmentDigest: report.environmentDigest,
                cmsMediatedCutover: report.cutover.cmsMediated,
                providerDirectCutover: report.cutover.providerDirect,
                ...(report.cutoverEvidence
                    ? {
                          cmsMediatedCutoverOutcome: report.cutoverEvidence.cmsMediated.outcome,
                          providerDirectCutoverOutcome: report.cutoverEvidence.providerDirect.outcome,
                          activationOutcome: report.cutoverEvidence.activation.outcome,
                      }
                    : {}),
                rollback: report.rollback,
                pointOfNoReturn: report.pointOfNoReturn,
                ...(cmsDrainSeconds === undefined ? {} : { cmsDrainSeconds }),
                ...(providerDrainSeconds === undefined ? {} : { providerDrainSeconds }),
                downtimeStatus: operational?.downtime.status ?? "not-recorded",
                ...(operational?.downtime.observedSeconds === undefined
                    ? {}
                    : { observedDowntimeSeconds: operational.downtime.observedSeconds }),
                rollbackVerified: operational?.rollback.verified ?? false,
                pointOfNoReturnObservation: operational?.pointOfNoReturn.observation ?? "not-recorded",
                cleanupObserved: operational?.cleanup.observed ?? report.delayedCleanupVerified,
                ...(operational?.cleanup.delaySeconds === undefined
                    ? {}
                    : { cleanupDelaySeconds: operational.cleanup.delaySeconds }),
            },
        ];
    });
}
