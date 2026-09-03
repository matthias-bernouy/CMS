import { describe, expect, test } from "bun:test";
import { planReleaseVerification } from "@bernouy/cms-integration-verification";
import { defineUpgradeScenarios } from "@bernouy/cms-integration-verification/upgrade-fixtures/v1";
import { executeReleaseVerificationPlan } from "../../src/release/verification/runtime";
import { ReleaseScenarioInfrastructureError } from "../../src/release/sandbox/scenario";
import {
    captureReleaseSandboxDockerVolumes,
    mountedDockerVolumes,
    releaseSandboxContainerIds,
    removeReleaseSandboxDockerVolumes,
} from "../../src/release/sandbox/scenario/dockerVolumes";
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
        let attempts = 0;

        await expect(
            executeReleaseVerificationPlan({
                candidate,
                baselines: [],
                availablePackages: [],
                plan,
                continueOnFailure: true,
                runScenario: async () => {
                    attempts += 1;
                    throw new ReleaseScenarioInfrastructureError(new Error("temporary daemon failure"));
                },
            }),
        ).rejects.toBeInstanceOf(ReleaseScenarioInfrastructureError);
        expect(attempts).toBe(3);
    });

    test("recreates only the affected scenario after a transient infrastructure failure", async () => {
        const candidate = await releasePackage("1.0.0");
        const plan = planReleaseVerification({ baselines: [], hasMigrations: false });
        let attempts = 0;

        const execution = await executeReleaseVerificationPlan({
            candidate,
            baselines: [],
            availablePackages: [],
            plan,
            continueOnFailure: true,
            runScenario: async () => {
                attempts += 1;
                if (attempts === 1) {
                    throw new ReleaseScenarioInfrastructureError(new Error("temporary daemon failure"));
                }
            },
        });

        expect(attempts).toBe(2);
        expect(execution.scenarios).toEqual([{ scenario: plan.scenarios[0], outcome: "passed" }]);
    });
});

describe("release sandbox Docker volume cleanup", () => {
    test("captures only volumes mounted by the exact ephemeral Supabase project", async () => {
        const projectRef = "ulvia-release-123456abcdef";
        const commands: readonly Readonly<{ exitCode: number; stdout: string; stderr: string }>[] = [
            {
                exitCode: 0,
                stdout: [
                    JSON.stringify({ ID: "a".repeat(12), Names: `supabase_db_${projectRef}` }),
                    JSON.stringify({ ID: "b".repeat(12), Names: "supabase_db_unrelated" }),
                ].join("\n"),
                stderr: "",
            },
            {
                exitCode: 0,
                stdout: JSON.stringify([
                    { Type: "bind", Source: "/tmp/project" },
                    { Type: "volume", Name: "a".repeat(64) },
                    { Type: "volume", Name: "b".repeat(64) },
                ]),
                stderr: "",
            },
        ];
        const calls: string[][] = [];
        let index = 0;

        const volumes = await captureReleaseSandboxDockerVolumes(projectRef, async (arguments_) => {
            calls.push([...arguments_]);
            return commands[index++]!;
        });

        expect(volumes).toEqual(["a".repeat(64), "b".repeat(64)]);
        expect(calls[1]).toEqual(["container", "inspect", "--format", "{{json .Mounts}}", "a".repeat(12)]);
    });

    test("removes only captured volumes and verifies a failed deletion", async () => {
        const calls: string[][] = [];
        const volume = "c".repeat(64);
        await expect(
            removeReleaseSandboxDockerVolumes([volume], async (arguments_) => {
                calls.push([...arguments_]);
                return { exitCode: calls.length === 1 ? 1 : 0, stdout: "", stderr: "" };
            }),
        ).rejects.toThrow(/retained/);
        expect(calls).toEqual([
            ["volume", "rm", volume],
            ["volume", "inspect", volume],
        ]);
    });

    test("rejects neighboring projects and malformed mount inventories", () => {
        const projectRef = "ulvia-release-123456abcdef";
        expect(
            releaseSandboxContainerIds(
                JSON.stringify({ ID: "a".repeat(12), Names: `supabase_db_${projectRef}-neighbor` }),
                projectRef,
            ),
        ).toEqual([]);
        expect(() => mountedDockerVolumes(JSON.stringify({ Type: "volume" }))).toThrow(/invalid/);
    });
});
