import { afterEach, describe, expect, test } from "bun:test";
import type { ReleaseAdmissionPolicySnapshotV1 } from "@bernouy/cms-integration-verification";
import { FsIntegrationRegistryCandidateAdmissionPlanningError } from "@bernouy/cms-integration-registry/fs";
import { reviewedBaseline } from "../../baselines/fixtures";
import {
    cleanupRegistryFixtures,
    registryFixture,
    seedLegacySqlBaseline,
    sqlPublicationPackage,
} from "../../publication/fixtures";
import { planningPolicy, verificationCandidate } from "../planning/fixtures";
import { completePassedCandidate } from "./fixtures";

afterEach(cleanupRegistryFixtures);

describe("candidate admission without a migration proof plan", () => {
    test("fails before queueing and keeps a stateful target private", async () => {
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
        let failure: unknown;
        try {
            await completePassedCandidate(fixture, "candidate-migration-missing", candidate, policy);
        } catch (error) {
            failure = error;
        }

        expect(failure).toBeInstanceOf(FsIntegrationRegistryCandidateAdmissionPlanningError);
        expect(failure).toMatchObject({ code: "migration_input_unavailable" });
        expect((failure as Error).message).toMatch(/has no migration plan/);
        expect(fixture.snapshots.current().locateExactVersion("demo", "1.1.0")).toBeNull();
        expect(
            fixture.snapshots
                .current()
                .getIndex("demo")
                ?.versions.map((entry) => entry.version),
        ).not.toContain("1.1.0");
    });
});
