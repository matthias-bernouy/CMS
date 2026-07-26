import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import {
    IntegrationRegistryVersionEligibilityConfirmationError,
    IntegrationRegistryVersionEligibilityConflictError,
    IntegrationRegistryVersionEligibilityIneligibleError,
    IntegrationRegistryVersionEligibilityStaleDecisionError,
} from "../../../src/core/promotion/eligibilityErrors";
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
} from "./fixtures";

afterEach(cleanupRegistryFixtures);

describe("filesystem version eligibility mutations", () => {
    test("blocks a stable/latest version, repairs both channels, and retains its exact package", async () => {
        const fixture = registryFixture();
        await publishVersions(fixture, ["1.0.0", "1.1.0"]);
        const evidence = await appendDecision(fixture, "1.1.0");
        const result = await eligibilityManager(fixture, evidence.stores.decisions).blockVersion(
            blockRequest("1.1.0", evidence.reference),
        );

        expect(result.snapshot.getIndex("demo")).toMatchObject({
            stable: "1.0.0",
            latest: "1.0.0",
            versions: [{ version: "1.0.0" }, { version: "1.1.0", status: "blocked" }],
        });
        expect(result.snapshot.locateExactVersion("demo", "1.1.0")?.package.digest).toBe(
            evidence.decision.packageDigest,
        );
        expect(existsSync(result.snapshot.locateExactVersion("demo", "1.1.0")!.packageRoot)).toBeTrue();
        expect(await persistedEligibilityRecord(fixture.root)).toMatchObject({
            action: "block",
            decision: evidence.reference,
            provenance: { actor: "admin:user-1", reason: "Emergency security block" },
            previousChannels: { stable: "1.0.0", latest: "1.1.0" },
            nextChannels: { stable: "1.0.0", latest: "1.0.0" },
        });
        expect(readdirSync(eligibilityJournals(fixture.root))).toEqual([]);
    });

    test("leaves a single blocked version visible and exact with no installable channel", async () => {
        const fixture = registryFixture();
        await publishVersions(fixture, ["1.0.0"]);
        const evidence = await appendDecision(fixture, "1.0.0");

        const result = await eligibilityManager(fixture, evidence.stores.decisions).blockVersion(
            blockRequest("1.0.0", evidence.reference),
        );

        expect(result.snapshot.getIndex("demo")).toEqual({
            schema: "cms.integration.index.v1",
            kind: "demo",
            label: "Integration demo",
            versions: [
                {
                    version: "1.0.0",
                    path: "versions/1.0.0",
                    definition: "versions/1.0.0/definition.json",
                    status: "blocked",
                },
            ],
        });
        expect(result.snapshot.locateExactVersion("demo", "1.0.0")).not.toBeNull();
    });

    test("repairs prerelease-aware stable and latest channels independently", async () => {
        const fixture = registryFixture();
        await publishVersions(fixture, ["1.0.0", "1.1.0", "2.0.0-beta.1"]);
        const evidence = await appendDecision(fixture, "1.1.0");

        const result = await eligibilityManager(fixture, evidence.stores.decisions).blockVersion(
            blockRequest("1.1.0", evidence.reference),
        );

        expect(result.snapshot.getIndex("demo")).toMatchObject({ stable: "1.0.0", latest: "2.0.0-beta.1" });
    });

    test("requires an exact confirmation and exact current decision revision plus digest", async () => {
        const fixture = registryFixture();
        await publishVersions(fixture, ["1.0.0"]);
        const evidence = await appendDecision(fixture, "1.0.0");
        const manager = eligibilityManager(fixture, evidence.stores.decisions);
        const request = blockRequest("1.0.0", evidence.reference);

        await expect(
            manager.blockVersion({ ...request, confirmation: { ...request.confirmation, version: "1.0.1" } }),
        ).rejects.toBeInstanceOf(IntegrationRegistryVersionEligibilityConfirmationError);
        const substitutedStore = {
            get: async () => {
                const history = await evidence.stores.decisions.get("demo", "1.0.0");
                return history ? { ...history, currentReportDigest: "f".repeat(64) } : null;
            },
            getHistory: evidence.stores.decisions.getHistory.bind(evidence.stores.decisions),
            append: evidence.stores.decisions.append.bind(evidence.stores.decisions),
        };
        await expect(
            eligibilityManager(fixture, substitutedStore).blockVersion({
                ...request,
                currentDecision: { ...request.currentDecision, digest: "f".repeat(64) },
                confirmation: { ...request.confirmation, decisionDigest: "f".repeat(64) },
            }),
        ).rejects.toBeInstanceOf(IntegrationRegistryVersionEligibilityStaleDecisionError);
        await appendAdverseDecisionRevision(evidence.stores, evidence);
        await expect(manager.blockVersion(request)).rejects.toBeInstanceOf(
            IntegrationRegistryVersionEligibilityStaleDecisionError,
        );
        expect(fixture.snapshots.current().getIndex("demo")?.versions[0]?.status).toBeUndefined();
        expect(existsSync(eligibilityRecords(fixture.root))).toBe(false);
    });

    test("marks only an adverse current decision inadmissible through the same channel repair", async () => {
        const fixture = registryFixture();
        await publishVersions(fixture, ["1.0.0", "1.1.0"]);
        const current = await appendDecision(fixture, "1.1.0");
        const manager = eligibilityManager(fixture, current.stores.decisions);
        const base = {
            kind: "demo",
            version: "1.1.0",
            currentDecision: current.reference,
            actor: "repository:reevaluator",
            reason: "Composite decision became inadmissible",
        };

        await expect(manager.markVersionInadmissible(base)).rejects.toBeInstanceOf(
            IntegrationRegistryVersionEligibilityIneligibleError,
        );
        const adverse = await appendAdverseDecisionRevision(current.stores, current);
        const result = await manager.markVersionInadmissible({ ...base, currentDecision: adverse.reference });

        expect(result.snapshot.getIndex("demo")).toMatchObject({
            stable: "1.0.0",
            latest: "1.0.0",
            versions: [{ version: "1.0.0" }, { version: "1.1.0", status: "inadmissible" }],
        });
        expect(result.record).toMatchObject({ action: "mark-inadmissible", decision: adverse.reference });
        expect(result.record.confirmation).toBeUndefined();
    });

    test("serializes concurrent blocks so one immutable audit record wins", async () => {
        const fixture = registryFixture();
        await publishVersions(fixture, ["1.0.0"]);
        const evidence = await appendDecision(fixture, "1.0.0");
        let sequence = 0;
        const manager = eligibilityManager(fixture, evidence.stores.decisions, {
            createOperationId: () => `eligibility-operation-${++sequence}`,
            createRecordId: () => `eligibility-record-${sequence}`,
        });
        const request = blockRequest("1.0.0", evidence.reference);

        const results = await Promise.allSettled([manager.blockVersion(request), manager.blockVersion(request)]);

        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
        expect(rejected.reason).toBeInstanceOf(IntegrationRegistryVersionEligibilityConflictError);
        expect(readdirSync(eligibilityRecords(fixture.root))).toHaveLength(1);
    });
});
