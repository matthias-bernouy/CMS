import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
import { completeDecisionEvidence, releaseStores } from "../reports/fixtures";
import {
    adverseRevision,
    persistedRecord,
    promotionJournals,
    promotionRecords,
    reportStore,
} from "./promotionFixtures";

afterEach(cleanupRegistryFixtures);

describe("filesystem stable promotion recovery", () => {
    test("replays a composite promotion against the exact immutable decision digest", async () => {
        const fixture = registryFixture();
        const source = await fixture.publisher.publish({ package: await publicationPackage("demo", "1.0.0") });
        const target = await fixture.publisher.publish({ package: await publicationPackage("demo", "1.1.0") });
        const stores = releaseStores(fixture);
        const evidence = await completeDecisionEvidence(source.digest, target.digest);
        await stores.compatibilityReports.append({ report: evidence.compatibility, expectedCurrent: null });
        await stores.verificationReports.append({ report: evidence.verification, expectedCurrent: null });
        await stores.migrationReports.append({ report: evidence.migration, expectedCurrent: null });
        await stores.decisions.append({ report: evidence.decision, expectedCurrent: null });
        const promoter = new FsIntegrationRegistryStablePromoter({
            root: fixture.root,
            snapshots: fixture.snapshots,
            decisions: stores.decisions,
            mutations: fixture.mutations,
            createOperationId: () => "composite-crash",
            createPromotionId: () => "composite-promotion",
            afterBoundary: (boundary) => {
                if (boundary.phase === "index-written") {
                    throw new Error("crash after composite index write");
                }
            },
        });
        await expect(
            promoter.promoteStable({
                kind: "demo",
                version: "1.1.0",
                currentReportRevisionId: evidence.decision.decisionId,
                actor: "admin:user-1",
                confirmation: { version: "1.1.0", reportRevisionId: evidence.decision.decisionId },
            }),
        ).rejects.toBeInstanceOf(FsIntegrationRegistryStablePromotionSimulatedCrashError);

        const snapshots = emptySnapshotReference();
        const decisions = restartedReleaseDecisions(fixture.root, snapshots);
        const recovered = await new FsIntegrationRegistryRecoverer({
            root: fixture.root,
            snapshots,
            releaseDecisions: decisions,
        }).recover();

        expect(recovered.snapshot.getIndex("demo")?.stable).toBe("1.1.0");
        expect(await persistedRecord(fixture.root)).toMatchObject({
            schema: "cms.integration.registry.stable-promotion.v2",
            reportRevisionId: evidence.decision.decisionId,
            reportType: "release-admission-decision",
        });
    });

    test("replays every durable promotion boundary and is idempotent", async () => {
        for (const phase of FS_INTEGRATION_REGISTRY_STABLE_PROMOTION_PHASES) {
            const fixture = registryFixture();
            await fixture.publisher.publish({ package: await publicationPackage("demo", "1.0.0") });
            const published = await fixture.publisher.publish({ package: await publicationPackage("demo", "1.1.0") });
            const reports = reportStore(fixture);
            const promoter = new FsIntegrationRegistryStablePromoter({
                root: fixture.root,
                snapshots: fixture.snapshots,
                reports,
                mutations: fixture.mutations,
                createOperationId: () => `crash-${phase}`,
                createPromotionId: () => `promotion-${phase}`,
                now: () => "2026-07-26T12:00:00.000Z",
                afterBoundary: (boundary) => {
                    if (boundary.phase === phase) {
                        throw new Error(`crash after ${phase}`);
                    }
                },
            });

            await expect(
                promoter.promoteStable({
                    kind: "demo",
                    version: "1.1.0",
                    currentReportRevisionId: published.report.id,
                    actor: "admin:user-1",
                    confirmation: { version: "1.1.0", reportRevisionId: published.report.id },
                }),
            ).rejects.toBeInstanceOf(FsIntegrationRegistryStablePromotionSimulatedCrashError);
            expect(readdirSync(promotionJournals(fixture.root))).toEqual([`crash-${phase}.json`]);

            const restartedSnapshots = emptySnapshotReference();
            const recoverer = new FsIntegrationRegistryRecoverer({
                root: fixture.root,
                snapshots: restartedSnapshots,
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
            expect((await persistedRecord(fixture.root))?.reportRevisionId).toBe(published.report.id);
            expect(readdirSync(promotionJournals(fixture.root))).toEqual([]);

            const second = await recoverer.recover();
            expect(second.snapshot.getIndex("demo")?.stable).toBe("1.1.0");
            expect(second.diagnostics.some((entry) => entry.code.startsWith("stable-promotion"))).toBe(false);
        }
    });

    test("does not revive a prepared promotion after its confirmed report becomes stale", async () => {
        const fixture = registryFixture();
        await fixture.publisher.publish({ package: await publicationPackage("demo", "1.0.0") });
        const published = await fixture.publisher.publish({ package: await publicationPackage("demo", "1.1.0") });
        const reports = reportStore(fixture);
        const promoter = new FsIntegrationRegistryStablePromoter({
            root: fixture.root,
            snapshots: fixture.snapshots,
            reports,
            mutations: fixture.mutations,
            createOperationId: () => "stale-prepared",
            createPromotionId: () => "stale-promotion",
            afterBoundary: (boundary) => {
                if (boundary.phase === "prepared") {
                    throw new Error("crash before the index update");
                }
            },
        });
        await expect(
            promoter.promoteStable({
                kind: "demo",
                version: "1.1.0",
                currentReportRevisionId: published.report.id,
                actor: "admin:user-1",
                confirmation: { version: "1.1.0", reportRevisionId: published.report.id },
            }),
        ).rejects.toBeInstanceOf(FsIntegrationRegistryStablePromotionSimulatedCrashError);
        await reports.appendRevision(adverseRevision(fixture, published.report.id));

        const restartedSnapshots = emptySnapshotReference();
        const recovered = await new FsIntegrationRegistryRecoverer({
            root: fixture.root,
            snapshots: restartedSnapshots,
        }).recover();

        expect(recovered.snapshot.getIndex("demo")?.stable).toBe("1.0.0");
        expect(recovered.diagnostics).toContainEqual(
            expect.objectContaining({
                code: "stable-promotion-quarantined",
                operationId: "stale-prepared",
                message: expect.stringContaining("no longer the current compatibility revision"),
            }),
        );
        expect(readdirSync(promotionJournals(fixture.root))).toEqual([]);
    });

    test("rolls back an indexed promotion whose immutable audit record is corrupt", async () => {
        const fixture = registryFixture();
        await fixture.publisher.publish({ package: await publicationPackage("demo", "1.0.0") });
        const published = await fixture.publisher.publish({ package: await publicationPackage("demo", "1.1.0") });
        const promoter = new FsIntegrationRegistryStablePromoter({
            root: fixture.root,
            snapshots: fixture.snapshots,
            reports: reportStore(fixture),
            mutations: fixture.mutations,
            createOperationId: () => "corrupt-record",
            createPromotionId: () => "corrupt-record-promotion",
            afterBoundary: (boundary) => {
                if (boundary.phase === "record-written") {
                    throw new Error("crash after audit record");
                }
            },
        });
        await expect(
            promoter.promoteStable({
                kind: "demo",
                version: "1.1.0",
                currentReportRevisionId: published.report.id,
                actor: "admin:user-1",
                confirmation: { version: "1.1.0", reportRevisionId: published.report.id },
            }),
        ).rejects.toBeInstanceOf(FsIntegrationRegistryStablePromotionSimulatedCrashError);
        const records = promotionRecords(fixture.root);
        const record = join(records, readdirSync(records)[0]!);
        chmodSync(record, 0o640);
        writeFileSync(record, "{}");

        const recovered = await new FsIntegrationRegistryRecoverer({
            root: fixture.root,
            snapshots: emptySnapshotReference(),
        }).recover();

        expect(recovered.snapshot.getIndex("demo")?.stable).toBe("1.0.0");
        expect(recovered.diagnostics).toContainEqual(
            expect.objectContaining({ code: "stable-promotion-quarantined", operationId: "corrupt-record" }),
        );
        expect(readdirSync(records)).toEqual([]);
        expect(readdirSync(promotionJournals(fixture.root))).toEqual([]);
    });
});

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
