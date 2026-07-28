import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { identifyReleaseAdmissionDecision } from "@bernouy/cms-integration-verification";
import {
    createIntegrationRegistryCatalogSnapshot,
    InMemoryIntegrationRegistryMutationCoordinator,
    IntegrationRegistryCatalogSnapshotReference,
} from "@bernouy/cms-integration-registry";
import {
    FS_INTEGRATION_REGISTRY_STABLE_PROMOTION_PHASES,
    FsIntegrationCompatibilityV2ReportStore,
    FsIntegrationMigrationReportStore,
    FsIntegrationRegistryRecoverer,
    FsIntegrationRegistryStablePromoter,
    FsIntegrationRegistryStablePromotionSimulatedCrashError,
    FsIntegrationVerificationReportStore,
    FsReleaseAdmissionDecisionStore,
} from "@bernouy/cms-integration-registry/fs";
import { cleanupRegistryFixtures, publicationPackage, registryFixture } from "../publication/fixtures";
import { appendAdverseDecisionRevision, appendDecision } from "./eligibility/decisionFixtures";
import { persistedRecord, promotionJournals, promotionRecords } from "./promotionFixtures";

afterEach(cleanupRegistryFixtures);

describe("filesystem stable promotion recovery", () => {
    test("replays every durable boundary against the exact composite decision and is idempotent", async () => {
        for (const phase of FS_INTEGRATION_REGISTRY_STABLE_PROMOTION_PHASES) {
            const fixture = await publishedVersions();
            const current = await appendDecision(fixture, "1.1.0");
            const expectedDigest = (await identifyReleaseAdmissionDecision(current.decision)).digest;
            const promoter = crashingPromoter(fixture, current.stores.decisions, phase);

            await expect(promoter.promoteStable(promotionRequest(current.decision.decisionId))).rejects.toBeInstanceOf(
                FsIntegrationRegistryStablePromotionSimulatedCrashError,
            );
            expect(readdirSync(promotionJournals(fixture.root))).toEqual([`crash-${phase}.json`]);

            const restartedSnapshots = emptySnapshotReference();
            const recoverer = new FsIntegrationRegistryRecoverer({
                root: fixture.root,
                snapshots: restartedSnapshots,
                releaseDecisions: restartedReleaseDecisions(fixture.root, restartedSnapshots),
            });
            const recovered = await recoverer.recover();

            expect(recovered.snapshot.getIndex("demo")).toMatchObject({ stable: "1.1.0", latest: "1.1.0" });
            expect(recovered.diagnostics).toContainEqual(
                expect.objectContaining({
                    code: "stable-promotion-replayed",
                    operationId: `crash-${phase}`,
                    kind: "demo",
                    version: "1.1.0",
                }),
            );
            expect(await persistedRecord(fixture.root)).toMatchObject({
                schema: "cms.integration.registry.stable-promotion.v2",
                reportRevisionId: current.decision.decisionId,
                reportDigest: expectedDigest,
                reportType: "release-admission-decision",
            });
            expect(readdirSync(promotionJournals(fixture.root))).toEqual([]);

            const second = await recoverer.recover();
            expect(second.snapshot.getIndex("demo")?.stable).toBe("1.1.0");
            expect(second.diagnostics.some((entry) => entry.code.startsWith("stable-promotion"))).toBe(false);
        }
    });

    test("does not revive a prepared promotion after its confirmed decision becomes stale", async () => {
        const fixture = await publishedVersions();
        const current = await appendDecision(fixture, "1.1.0");
        const promoter = crashingPromoter(fixture, current.stores.decisions, "prepared", "stale-prepared");
        await expect(promoter.promoteStable(promotionRequest(current.decision.decisionId))).rejects.toBeInstanceOf(
            FsIntegrationRegistryStablePromotionSimulatedCrashError,
        );
        await appendAdverseDecisionRevision(current.stores, current);

        const restartedSnapshots = emptySnapshotReference();
        const recovered = await new FsIntegrationRegistryRecoverer({
            root: fixture.root,
            snapshots: restartedSnapshots,
            releaseDecisions: restartedReleaseDecisions(fixture.root, restartedSnapshots),
        }).recover();

        expect(recovered.snapshot.getIndex("demo")?.stable).toBe("1.0.0");
        expect(recovered.diagnostics).toContainEqual(
            expect.objectContaining({
                code: "stable-promotion-quarantined",
                operationId: "stale-prepared",
                message: expect.stringContaining("no longer the current release decision"),
            }),
        );
        expect(readdirSync(promotionJournals(fixture.root))).toEqual([]);
    });

    test("rolls back an indexed promotion whose immutable audit record is corrupt", async () => {
        const fixture = await publishedVersions();
        const current = await appendDecision(fixture, "1.1.0");
        const promoter = crashingPromoter(fixture, current.stores.decisions, "record-written", "corrupt-record");
        await expect(promoter.promoteStable(promotionRequest(current.decision.decisionId))).rejects.toBeInstanceOf(
            FsIntegrationRegistryStablePromotionSimulatedCrashError,
        );
        const records = promotionRecords(fixture.root);
        const record = join(records, readdirSync(records)[0]!);
        chmodSync(record, 0o640);
        writeFileSync(record, "{}");

        const restartedSnapshots = emptySnapshotReference();
        const recovered = await new FsIntegrationRegistryRecoverer({
            root: fixture.root,
            snapshots: restartedSnapshots,
            releaseDecisions: restartedReleaseDecisions(fixture.root, restartedSnapshots),
        }).recover();

        expect(recovered.snapshot.getIndex("demo")?.stable).toBe("1.0.0");
        expect(recovered.diagnostics).toContainEqual(
            expect.objectContaining({ code: "stable-promotion-quarantined", operationId: "corrupt-record" }),
        );
        expect(readdirSync(records)).toEqual([]);
        expect(readdirSync(promotionJournals(fixture.root))).toEqual([]);
    });
});

async function publishedVersions() {
    const fixture = registryFixture();
    await fixture.publisher.publish({ package: await publicationPackage("demo", "1.0.0") });
    await fixture.publisher.publish({ package: await publicationPackage("demo", "1.1.0") });
    return fixture;
}

function crashingPromoter(
    fixture: ReturnType<typeof registryFixture>,
    decisions: ReturnType<typeof restartedReleaseDecisions>,
    phase: (typeof FS_INTEGRATION_REGISTRY_STABLE_PROMOTION_PHASES)[number],
    operationId = `crash-${phase}`,
) {
    return new FsIntegrationRegistryStablePromoter({
        root: fixture.root,
        snapshots: fixture.snapshots,
        decisions,
        mutations: fixture.mutations,
        createOperationId: () => operationId,
        createPromotionId: () => `promotion-${phase}`,
        now: () => "2026-07-26T12:00:00.000Z",
        afterBoundary: (boundary) => {
            if (boundary.phase === phase) {
                throw new Error(`crash after ${phase}`);
            }
        },
    });
}

function promotionRequest(reportRevisionId: string) {
    return {
        kind: "demo",
        version: "1.1.0",
        currentReportRevisionId: reportRevisionId,
        actor: "admin:user-1",
        confirmation: { version: "1.1.0", reportRevisionId },
    };
}

function emptySnapshotReference(): IntegrationRegistryCatalogSnapshotReference {
    return new IntegrationRegistryCatalogSnapshotReference(createIntegrationRegistryCatalogSnapshot({ entries: [] }));
}

function restartedReleaseDecisions(root: string, snapshots: IntegrationRegistryCatalogSnapshotReference) {
    const mutations = new InMemoryIntegrationRegistryMutationCoordinator();
    const config = { root, snapshots, mutations };
    const compatibilityReports = new FsIntegrationCompatibilityV2ReportStore(config);
    const verificationReports = new FsIntegrationVerificationReportStore(config);
    const migrationReports = new FsIntegrationMigrationReportStore(config);
    return new FsReleaseAdmissionDecisionStore({
        ...config,
        compatibilityReports,
        verificationReports,
        migrationReports,
    });
}
