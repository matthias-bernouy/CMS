import {
    integrationVersionReleaseLevel,
    integrationVersionSatisfies,
    IntegrationInputError,
    isIntegrationDefinitionVersionInstallable,
    type IntegrationDefinition,
    type IntegrationDefinitionRepository,
    type IntegrationDefinitionVersion,
    type IntegrationInstallation,
} from "@bernouy/cms-integrations";
import type {
    IntegrationUpgradeMigrationEvidence,
    IntegrationUpgradeReleaseReader,
    IntegrationUpgradeTarget,
} from "./contracts";

type PreflightInput = Readonly<{
    repository: IntegrationDefinitionRepository;
    releases?: IntegrationUpgradeReleaseReader;
    installation: IntegrationInstallation;
    version: IntegrationDefinitionVersion;
}>;

export async function preflightIntegrationUpgrade(input: PreflightInput): Promise<IntegrationUpgradeTarget> {
    const releaseLevel = integrationVersionReleaseLevel(input.installation.definitionVersion, input.version.version);
    if (!isIntegrationDefinitionVersionInstallable(input.version)) {
        return {
            version: input.version.version,
            eligible: false,
            evidence: input.releases ? "composite" : "legacy-index",
            freshInstallOnly: false,
            ...(releaseLevel ? { releaseLevel } : {}),
            reasons: [`The release is ${input.version.status} and is not eligible for upgrades.`],
            migrations: [],
        };
    }
    if (!input.releases) {
        return legacyTarget(input.version.version, releaseLevel ?? undefined);
    }
    const [definition, release] = await Promise.all([
        input.repository.get(input.installation.id, input.version.version),
        input.releases.get(input.installation.id, input.version.version),
    ]);
    const reasons: string[] = [];
    if (!release) {
        reasons.push("No exact composite release decision is available.");
    } else {
        if (!release.installable || release.status !== "installable" || release.decision?.admissible !== true) {
            reasons.push(`The release is ${release.status} and is not eligible for upgrades.`);
        }
        if (release.freshInstallOnly) {
            reasons.push("The release is fresh-install-only.");
        }
    }
    if (!definition) {
        reasons.push("The exact target definition is unavailable.");
    }
    if (!releaseLevel) {
        reasons.push("The target is not newer than the installed version.");
    }
    const migrations =
        definition && release ? verifiedMigrations(input.installation, definition, release.migrations) : [];
    const migrationConnectors = definition?.connectors?.filter((connector) => connector.migration) ?? [];
    if (releaseLevel === "major" && migrationConnectors.length === 0) {
        reasons.push(
            "A major release requires a tested source-to-target migration and is otherwise fresh-install-only.",
        );
    }
    for (const connector of migrationConnectors) {
        if (!migrations.some((migration) => migration.connectorKey === connector.connectorKey)) {
            reasons.push(
                `No passed migration proof covers connector "${connector.connectorKey}" from this installation.`,
            );
        }
    }
    return {
        version: input.version.version,
        eligible: reasons.length === 0,
        evidence: "composite",
        freshInstallOnly: Boolean(release?.freshInstallOnly || (releaseLevel === "major" && migrations.length === 0)),
        ...(releaseLevel ? { releaseLevel } : {}),
        ...(release ? { packageDigest: release.packageDigest } : {}),
        reasons,
        migrations,
    };
}

export async function assertIntegrationUpgradePreflight(input: PreflightInput): Promise<IntegrationUpgradeTarget> {
    const target = await preflightIntegrationUpgrade(input);
    if (!target.eligible) {
        throw new IntegrationInputError("version", target.reasons.join(" "));
    }
    return target;
}

function legacyTarget(version: string, releaseLevel: string | undefined): IntegrationUpgradeTarget {
    return {
        version,
        eligible: true,
        evidence: "legacy-index",
        freshInstallOnly: false,
        ...(releaseLevel ? { releaseLevel } : {}),
        reasons: [],
        migrations: [],
    };
}

function verifiedMigrations(
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
