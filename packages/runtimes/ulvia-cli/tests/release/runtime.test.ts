import { describe, expect, test } from "bun:test";
import { planReleaseVerification } from "@bernouy/cms-integration-verification";
import { defineUpgradeScenarios } from "@bernouy/cms-integration-verification/upgrade-fixtures/v1";
import { executeReleaseVerificationPlan } from "../../src/release/verification/runtime";
import { ReleaseScenarioInfrastructureError } from "../../src/release/sandbox/scenario";
import { releasePackage } from "./support";

describe("shared release runtime plan execution", () => {
    test("resolves exact baselines and fixtures for local and remote callers", async () => {
        const candidate = await releasePackage("1.2.0");
        const baseline = await releasePackage("1.0.0");
        const plan = planReleaseVerification({
            baselines: [
                {
                    version: "1.0.0",
                    packageDigest: baseline.package.digest,
                    resilienceKey: "1".repeat(64),
                },
            ],
            fixtures: [{ name: "existing orders", from: "^1.0.0" }],
            hasMigrations: false,
        });
        const fixtures = defineUpgradeScenarios({
            schema: "ulvia.upgrade-fixtures.v1",
            scenarios: [
                {
                    name: "existing orders",
                    from: "^1.0.0",
                    seedBeforeUpgrade: () => null,
                    assertAfterUpgrade: () => undefined,
                },
            ],
        });
        const received: string[] = [];

        const execution = await executeReleaseVerificationPlan({
            candidate,
            baselines: [baseline],
            availablePackages: [],
            plan,
            fixtures,
            runScenario: async (scenario) => {
                received.push(
                    scenario.baseline
                        ? `${scenario.baseline.package.envelope.version}:${scenario.fixture?.name ?? "none"}`
                        : "fresh",
                );
            },
        });

        expect(received).toEqual(["fresh", "1.0.0:existing orders"]);
        expect(execution.scenarios.map(({ outcome }) => outcome)).toEqual(["passed", "passed"]);
    });

    test("can collect bounded scenario failures for authoritative evidence", async () => {
        const candidate = await releasePackage("1.0.0");
        const plan = planReleaseVerification({ baselines: [], hasMigrations: false });
        const execution = await executeReleaseVerificationPlan({
            candidate,
            baselines: [],
            availablePackages: [],
            plan,
            continueOnFailure: true,
            runScenario: async () => {
                throw new Error("candidate-controlled detail");
            },
        });

        expect(execution.scenarios).toHaveLength(1);
        expect(execution.scenarios[0]?.outcome).toBe("failed");
    });

    test("does not turn retryable infrastructure failures into candidate evidence", async () => {
        const candidate = await releasePackage("1.0.0");
        const plan = planReleaseVerification({ baselines: [], hasMigrations: false });

        await expect(
            executeReleaseVerificationPlan({
                candidate,
                baselines: [],
                availablePackages: [],
                plan,
                continueOnFailure: true,
                runScenario: async () => {
                    throw new ReleaseScenarioInfrastructureError(new Error("temporary daemon failure"));
                },
            }),
        ).rejects.toBeInstanceOf(ReleaseScenarioInfrastructureError);
    });
});
