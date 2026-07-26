import { afterEach, describe, expect, test } from "bun:test";
import type { ReleaseAdmissionPolicySnapshotV1 } from "@bernouy/cms-integration-verification";
import { FsIntegrationRegistryCandidateFinalizationError } from "@bernouy/cms-integration-registry/fs";
import { reviewedBaseline } from "../../baselines/fixtures";
import {
    cleanupRegistryFixtures,
    registryFixture,
    seedLegacySqlBaseline,
    sqlPublicationPackage,
} from "../../publication/fixtures";
import { planningPolicy, verificationCandidate } from "../planning/fixtures";
import { completePassedCandidate, releaseFinalizer } from "./fixtures";

afterEach(cleanupRegistryFixtures);

describe("candidate finalization without migration evidence", () => {
    test("fails closed and keeps a stateful target private", async () => {
        const fixture = registryFixture();
        const baselinePackage = await seedLegacySqlBaseline(fixture);
        await fixture.reviewedSchemaBaselines.append({
            baseline: await reviewedBaseline("baseline-missing-migration", {
                kind: "demo",
                packageDigest: baselinePackage.digest,
            }),
            expectedCurrentRevisionId: null,
        });
        const candidate = await verificationCandidate(
            await sqlPublicationPackage("demo", "1.1.0", {
                namespaces: [
                    {
                        name: "public",
                        relations: [
                            {
                                name: "items",
                                columns: [{ name: "id", type: "bigint", nullable: false }],
                                constraints: [],
                            },
                        ],
                    },
                ],
            }),
        );
        const basePolicy = await planningPolicy();
        const policy: ReleaseAdmissionPolicySnapshotV1 = {
            ...basePolicy,
            migrationEvidence: {
                ...basePolicy.migrationEvidence,
                requiredForReleaseLevels: ["minor"],
                requiredChecks: ["fresh-install", "migrated-state", "equivalence"],
            },
        };
        const setup = await completePassedCandidate(fixture, "candidate-migration-missing", candidate, policy);

        let failure: unknown;
        try {
            await releaseFinalizer(fixture, setup.store, policy).finalize("candidate-migration-missing");
        } catch (error) {
            failure = error;
        }

        expect(failure).toBeInstanceOf(FsIntegrationRegistryCandidateFinalizationError);
        expect(failure).toMatchObject({ code: "admission_rejected" });
        expect((failure as Error).message).toMatch(/migration-missing:/);
        expect(fixture.snapshots.current().locateExactVersion("demo", "1.1.0")).toBeNull();
        expect(
            fixture.snapshots
                .current()
                .getIndex("demo")
                ?.versions.map((entry) => entry.version),
        ).not.toContain("1.1.0");
    });
});
