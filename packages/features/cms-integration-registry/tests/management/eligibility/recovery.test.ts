import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FsReleaseAdmissionReconciler } from "@bernouy/cms-integration-registry/fs";
import { createIntegrationRegistryCatalogSnapshot } from "../../../src/core/catalog/snapshot";
import { IntegrationRegistryCatalogSnapshotReference } from "../../../src/core/catalog/reference";
import { FsIntegrationRegistryRecoverer } from "../../../src/default-implementation/fs/registry/recovery/recoverer";
import { FsIntegrationRegistryVersionEligibilityManager } from "../../../src/default-implementation/fs/registry/promotion/eligibility";
import { FS_INTEGRATION_REGISTRY_VERSION_ELIGIBILITY_PHASES } from "../../../src/default-implementation/fs/registry/promotion/eligibility/journal";
import { FsIntegrationRegistryVersionEligibilitySimulatedCrashError } from "../../../src/default-implementation/fs/registry/promotion/eligibility/types";
import { cleanupRegistryFixtures, registryFixture } from "../../publication/fixtures";
import {
    appendAdverseDecisionRevision,
    appendDecision,
    blockRequest,
    eligibilityJournals,
    eligibilityManager,
    eligibilityRecords,
    persistedEligibilityRecord,
    publishVersions,
    restartedDecisions,
} from "./fixtures";

afterEach(cleanupRegistryFixtures);

describe("filesystem version eligibility recovery", () => {
    test("replays every durable boundary deterministically and idempotently", async () => {
        for (const phase of FS_INTEGRATION_REGISTRY_VERSION_ELIGIBILITY_PHASES) {
            const fixture = registryFixture();
            await publishVersions(fixture, ["1.0.0"]);
            const evidence = await appendDecision(fixture, "1.0.0");
            const manager = eligibilityManager(fixture, evidence.stores.decisions, {
                createOperationId: () => `crash-${phase}`,
                createRecordId: () => `record-${phase}`,
                afterBoundary: (boundary) => {
                    if (boundary.phase === phase) {
                        throw new Error(`crash after ${phase}`);
                    }
                },
            });

            await expect(manager.blockVersion(blockRequest("1.0.0", evidence.reference))).rejects.toBeInstanceOf(
                FsIntegrationRegistryVersionEligibilitySimulatedCrashError,
            );
            expect(readdirSync(eligibilityJournals(fixture.root))).toEqual([`crash-${phase}.json`]);

            const snapshots = emptySnapshotReference();
            const recoverer = new FsIntegrationRegistryRecoverer({
                root: fixture.root,
                snapshots,
                releaseDecisions: restartedDecisions(fixture.root, snapshots),
            });
            const recovered = await recoverer.recover();

            expect(recovered.snapshot.getIndex("demo")?.versions[0]?.status).toBe("blocked");
            expect(recovered.snapshot.getIndex("demo")?.stable).toBeUndefined();
            expect(recovered.snapshot.locateExactVersion("demo", "1.0.0")).not.toBeNull();
            expect(recovered.diagnostics).toContainEqual(
                expect.objectContaining({
                    code: "version-eligibility-replayed",
                    operationId: `crash-${phase}`,
                    kind: "demo",
                    version: "1.0.0",
                }),
            );
            expect((await persistedEligibilityRecord(fixture.root))?.decision).toEqual(evidence.reference);
            expect(readdirSync(eligibilityJournals(fixture.root))).toEqual([]);

            const second = await recoverer.recover();
            expect(second.snapshot.getIndex("demo")?.versions[0]?.status).toBe("blocked");
            expect(second.diagnostics.some((entry) => entry.code.startsWith("version-eligibility"))).toBeFalse();
        }
    });

    test("does not revive a prepared mutation after its decision CAS becomes stale", async () => {
        const fixture = registryFixture();
        await publishVersions(fixture, ["1.0.0"]);
        const evidence = await appendDecision(fixture, "1.0.0");
        const manager = eligibilityManager(fixture, evidence.stores.decisions, {
            createOperationId: () => "stale-prepared",
            createRecordId: () => "stale-record",
            afterBoundary: (boundary) => {
                if (boundary.phase === "prepared") {
                    throw new Error("crash before index write");
                }
            },
        });
        await expect(manager.blockVersion(blockRequest("1.0.0", evidence.reference))).rejects.toBeInstanceOf(
            FsIntegrationRegistryVersionEligibilitySimulatedCrashError,
        );
        await appendAdverseDecisionRevision(evidence.stores, evidence);

        const snapshots = emptySnapshotReference();
        const recovered = await new FsIntegrationRegistryRecoverer({
            root: fixture.root,
            snapshots,
            releaseDecisions: restartedDecisions(fixture.root, snapshots),
        }).recover();

        expect(recovered.snapshot.getIndex("demo")?.versions[0]?.status).toBeUndefined();
        expect(recovered.snapshot.getIndex("demo")).toMatchObject({ stable: "1.0.0", latest: "1.0.0" });
        expect(recovered.diagnostics).toContainEqual(
            expect.objectContaining({
                code: "version-eligibility-quarantined",
                operationId: "stale-prepared",
                message: expect.stringContaining("no longer current"),
            }),
        );
    });

    test("rolls back an indexed mutation whose immutable audit record is corrupt", async () => {
        const fixture = registryFixture();
        await publishVersions(fixture, ["1.0.0"]);
        const evidence = await appendDecision(fixture, "1.0.0");
        const manager = new FsIntegrationRegistryVersionEligibilityManager({
            root: fixture.root,
            snapshots: fixture.snapshots,
            decisions: evidence.stores.decisions,
            mutations: fixture.mutations,
            createOperationId: () => "corrupt-record",
            createRecordId: () => "corrupt-record-id",
            afterBoundary: (boundary) => {
                if (boundary.phase === "record-written") {
                    throw new Error("crash after record write");
                }
            },
        });
        await expect(manager.blockVersion(blockRequest("1.0.0", evidence.reference))).rejects.toBeInstanceOf(
            FsIntegrationRegistryVersionEligibilitySimulatedCrashError,
        );
        const records = eligibilityRecords(fixture.root);
        const record = join(records, readdirSync(records)[0]!);
        chmodSync(record, 0o640);
        writeFileSync(record, "{}");

        const snapshots = emptySnapshotReference();
        const recovered = await new FsIntegrationRegistryRecoverer({
            root: fixture.root,
            snapshots,
            releaseDecisions: restartedDecisions(fixture.root, snapshots),
        }).recover();

        expect(recovered.snapshot.getIndex("demo")?.versions[0]?.status).toBeUndefined();
        expect(recovered.snapshot.getIndex("demo")?.stable).toBe("1.0.0");
        expect(recovered.snapshot.locateExactVersion("demo", "1.0.0")).not.toBeNull();
        expect(recovered.diagnostics).toContainEqual(
            expect.objectContaining({ code: "version-eligibility-quarantined", operationId: "corrupt-record" }),
        );
        expect(readdirSync(records)).toEqual([]);
        expect(readdirSync(eligibilityJournals(fixture.root))).toEqual([]);
    });

    test("repairs channels after a decision commit that crashed before eligibility mutation", async () => {
        const fixture = registryFixture();
        await publishVersions(fixture, ["1.0.0", "1.1.0"]);
        const current = await appendDecision(fixture, "1.1.0");
        await appendAdverseDecisionRevision(current.stores, current);
        const eligibility = eligibilityManager(fixture, current.stores.decisions);
        const reconciler = new FsReleaseAdmissionReconciler({
            snapshots: fixture.snapshots,
            compatibility: current.stores.compatibilityReports,
            verification: current.stores.verificationReports,
            migrations: current.stores.migrationReports,
            decisions: current.stores.decisions,
            eligibility,
        });

        await reconciler.reconcileAll({
            actor: "repository:recovery",
            reason: "Repair current composite decision eligibility",
        });

        expect(fixture.snapshots.current().getIndex("demo")).toMatchObject({
            stable: "1.0.0",
            latest: "1.0.0",
            versions: [{ version: "1.0.0" }, { version: "1.1.0", status: "inadmissible" }],
        });
        expect(readdirSync(eligibilityJournals(fixture.root))).toEqual([]);
    });
});

function emptySnapshotReference(): IntegrationRegistryCatalogSnapshotReference {
    return new IntegrationRegistryCatalogSnapshotReference(createIntegrationRegistryCatalogSnapshot({ entries: [] }));
}
