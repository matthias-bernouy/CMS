import {
    integrationVersionReleaseLevel,
    IntegrationInputError,
    isIntegrationDefinitionVersionInstallable,
    type IntegrationDefinitionRepository,
    type IntegrationDefinitionVersion,
    type IntegrationInstallation,
} from "@bernouy/cms-integrations";
import { isIntegrationReleaseFreshInstallOnly } from "@bernouy/cms-integration-verification";
import type { IntegrationUpgradeReleaseReader, IntegrationUpgradeTarget } from "./contracts";
import { migrationRequirements, verifiedMigrations } from "./migrationEvidence";

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
    const sourcePackageDigest = input.installation.packageDigest;
    const lacksPackageProvenance = migrationConnectors.length > 0 && !sourcePackageDigest;
    const passedMigrations = sourcePackageDigest
        ? migrations.map((migration) => ({
              source: {
                  kind: input.installation.id,
                  version: input.installation.definitionVersion,
                  packageDigest: sourcePackageDigest,
              },
              connectorKey: migration.connectorKey,
              lineageId: migration.lineageId,
              outcome: "passed" as const,
          }))
        : [];
    const freshInstallOnly =
        release?.freshInstallOnly === true ||
        lacksPackageProvenance ||
        isIntegrationReleaseFreshInstallOnly({
            releaseLevel: releaseLevel ?? undefined,
            requiredMigrations: migrationRequirements(input.installation, definition),
            migrations: passedMigrations,
        });
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
        freshInstallOnly,
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
