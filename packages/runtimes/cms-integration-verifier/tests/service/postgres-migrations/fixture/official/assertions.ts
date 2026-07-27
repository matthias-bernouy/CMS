import { expect } from "bun:test";
import type { IntegrationInstallation } from "@bernouy/cms-integrations";
import type { OfficialUpgradeHarness } from "./harness";
import type { OfficialUpgradeScenario } from "./scenario";

export async function expectExactLegacyAdoption(
    harness: OfficialUpgradeHarness,
    scenario: OfficialUpgradeScenario,
): Promise<void> {
    const installation = await scenario.adoptedInstallation();
    expect(installation).toMatchObject({
        definitionVersion: "1.0.0",
        packageDigest: harness.release.source.digest,
        status: "success",
        connectorBindings: {
            primary: {
                connectorKey: "primary",
                lineageId: "photo-albums-supabase-v1",
                migrationRevision: 0,
            },
        },
        connectorBaselineAdoptions: [
            {
                sourceDefinitionVersion: "1.0.0",
                sourcePackageDigest: harness.release.source.digest,
                targetDefinitionVersion: "1.1.0",
                targetPackageDigest: harness.release.target.digest,
                migrationRevision: 0,
            },
        ],
    });
    expect(scenario.sourceEvidence.relations).toEqual([{ sourceInstalled: true, targetInstalled: false }]);
    expect(scenario.sourceEvidence.ledger).toEqual([]);
    expect(scenario.sourceEvidence.instances).toEqual([
        {
            connectorKey: "primary",
            lineageId: "photo-albums-supabase-v1",
            revision: 0,
            packageVersion: "1.0.0",
            packageDigest: harness.release.source.digest,
            baselineDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
    ]);
}

export async function expectRecoveredOfficialUpgrade(
    harness: OfficialUpgradeHarness,
    scenario: OfficialUpgradeScenario,
    paused: IntegrationInstallation,
    resumed: Awaited<ReturnType<OfficialUpgradeScenario["resumeFromReconstructedComposition"]>>,
): Promise<void> {
    const pausedOperation = paused.migrationOperation;
    const resumedOperation = resumed.result.installation.migrationOperation;
    if (!pausedOperation || !resumedOperation) {
        throw new Error("Official migration recovery lost its durable operation");
    }
    expect(scenario.firstRepository).not.toBe(scenario.resumedRepository);
    expect(scenario.firstRuntime).not.toBe(scenario.resumedRuntime);
    expect(resumedOperation.id).toBe(pausedOperation.id);
    expect(resumedOperation.attemptId).not.toBe(pausedOperation.attemptId);
    expect(resumedOperation.fencingToken).toBe(pausedOperation.fencingToken + 1);
    expect(resumedOperation.revision).toBeGreaterThan(pausedOperation.revision);
    expect(resumedOperation.journal.map(journalIdentity)).toEqual(pausedOperation.journal.map(journalIdentity));
    expect(resumedOperation.journal.find(({ phase }) => phase === scenario.phase)?.attemptId).toBe(
        resumedOperation.attemptId,
    );
    expect(resumed.packages.source).toMatchObject({
        root: harness.sourcePackage.root,
        digest: harness.release.source.digest,
    });
    expect(resumed.packages.target).toMatchObject({
        root: harness.targetPackage.root,
        digest: harness.release.target.digest,
    });
    expect(resumed.result.installation).toMatchObject({
        definitionVersion: "1.1.0",
        definitionSnapshot: { kind: "photo-albums", version: "1.1.0" },
        packageDigest: harness.release.target.digest,
        status: "success",
        connectorBindings: { primary: { migrationRevision: 1 } },
        migrationOperation: {
            status: "completed",
            pointOfNoReturnReachedAt: expect.any(Date),
        },
    });
    expect(
        resumed.result.installation.migrationOperation?.journal.every(({ status }) => status === "succeeded"),
    ).toBeTrue();
    expect(harness.release.targetPlan.migrations.find(({ id }) => id === "add-photo-credit")?.checksum).toBeDefined();
    const expectedChecksum = harness.release.targetPlan.migrations.find(
        ({ id }) => id === "add-photo-credit",
    )!.checksum;
    const database = await scenario.databaseEvidence();
    expect(database.ledger).toEqual([
        {
            migrationId: "add-photo-credit",
            checksum: expectedChecksum,
            revision: 1,
            sourcePackageDigest: harness.release.source.digest,
            targetPackageDigest: harness.release.target.digest,
        },
    ]);
    expect(database.instances).toEqual([
        {
            connectorKey: "primary",
            lineageId: "photo-albums-supabase-v1",
            revision: 1,
            packageVersion: "1.1.0",
            packageDigest: harness.release.target.digest,
            baselineDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
    ]);
    expect(database.relations).toEqual([{ sourceInstalled: true, targetInstalled: true }]);
    const expectedDeployments = scenario.phase === "deploy-functions" ? 2 : 1;
    expect(scenario.management.functionDeployments).toEqual(new Map([["cms-photo-albums", expectedDeployments]]));
    const deploymentDigests = scenario.management.functionDeploymentDigests.get("cms-photo-albums") ?? [];
    expect(deploymentDigests).toHaveLength(expectedDeployments);
    expect(new Set(deploymentDigests).size).toBe(1);
    expect(scenario.management.functionReceipt("cms-photo-albums")).toMatchObject({
        slug: "cms-photo-albums",
        status: "ACTIVE",
        ezbr_sha256: deploymentDigests[0],
    });
    expect(scenario.management.databaseMutationDigests).toHaveLength(4);
    const locallyReplayedPhase =
        scenario.phase === "deploy-functions" || scenario.phase === "provider-direct-transition"
            ? scenario.phase
            : undefined;
    expect([...scenario.executionCounts.entries()].sort()).toEqual(
        (
            [
                "contract",
                "deploy-functions",
                "drain",
                "expand",
                "point-of-no-return",
                "provider-direct-transition",
                "smoke-cms",
                "smoke-target",
                "switch-cms-binding",
            ] as const
        ).map((phase) => [phase, phase === locallyReplayedPhase ? 2 : 1]),
    );
    if (!scenario.firstRepository?.compareAndSwapMigration) {
        throw new Error("Official migration fixture lost Mongo compare-and-swap support");
    }
    expect(await scenario.firstRepository.compareAndSwapMigration(paused, paused)).toBeNull();
    expect(await scenario.installation()).toEqual(resumed.result.installation);
}

function journalIdentity(entry: {
    id: string;
    idempotencyKey: string;
    phase: string;
    targetDigest: string;
}): Record<string, string> {
    return {
        id: entry.id,
        idempotencyKey: entry.idempotencyKey,
        phase: entry.phase,
        targetDigest: entry.targetDigest,
    };
}
