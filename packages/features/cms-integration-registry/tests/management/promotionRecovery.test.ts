import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
    createIntegrationRegistryCatalogSnapshot,
    IntegrationRegistryCatalogSnapshotReference,
} from "@bernouy/cms-integration-registry";
import {
    FS_INTEGRATION_REGISTRY_STABLE_PROMOTION_PHASES,
    FsIntegrationRegistryRecoverer,
    FsIntegrationRegistryStablePromoter,
    FsIntegrationRegistryStablePromotionSimulatedCrashError,
} from "@bernouy/cms-integration-registry/fs";
import { cleanupRegistryFixtures, publicationPackage, registryFixture } from "../publication/fixtures";
import {
    adverseRevision,
    persistedRecord,
    promotionJournals,
    promotionRecords,
    reportStore,
} from "./promotionFixtures";

afterEach(cleanupRegistryFixtures);

describe("filesystem stable promotion recovery", () => {
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
