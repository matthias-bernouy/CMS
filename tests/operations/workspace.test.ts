import { expect, test } from "bun:test";
import { executeWorkspace, workspaceSteps } from "../../infra/workspace";

test("focused test arguments are forwarded and verify rejects partial selection", () => {
    const args = ["./packages/features/auth/tests", "--test-name-pattern", "authorization"];
    expect(workspaceSteps("test", args).at(-1)?.args).toEqual(["bun", "test", ...args]);
    expect(() => workspaceSteps("verify", ["--only", "tests"])).toThrow("Usage:");
});

test("verify retains functional acceptance and static performance guards without measured campaigns", () => {
    const steps = workspaceSteps("verify", []);
    expect(steps.filter(({ args }) => args.includes("infra/bootstrap.ts"))).toHaveLength(1);
    expect(steps.filter(({ args }) => args.includes("build:browser"))).toHaveLength(1);
    expect(steps.find(({ env }) => env?.ULVIA_RUN_EDGE_SMOKE === "1")?.args).toContain(
        "packages/runtimes/ulvia-cli/tests/stack/edge-smoke.browser.test.ts",
    );
    expect(steps.find(({ env }) => env?.ULVIA_RUN_COLLECTION_STYLE_BROWSER === "1")).toMatchObject({
        args: ["bun", "test", "./tests/integration/collections/animations.browser.test.ts"],
        continueOnFailure: true,
    });
    expect(workspaceSteps("test", []).some(({ env }) => env?.ULVIA_RUN_COLLECTION_STYLE_BROWSER === "1")).toBe(false);
    expect(steps.find(({ env }) => env?.ULVIA_RUN_CONTENT_LIFECYCLE === "1")).toMatchObject({
        args: ["bun", "test", "./tests/integration/content", "./tests/integration/observability"],
        env: { ULVIA_RUN_CLUSTER_LOGS_MONGO: "1" },
        continueOnFailure: true,
    });
    expect(steps.filter(({ args }) => args.includes("infra/images/build.ts"))).toHaveLength(1);
    expect(steps.at(-1)?.env?.ULVIA_TLS_TEST_IMAGE).toBe("docker.io/cyaxis/ulvia-provider:0.1.0-verify");
    expect(steps.some(({ args }) => args.includes("tests/performance/command/check.ts"))).toBe(true);
    expect(steps.filter(({ args }) => args.includes("tests/performance/compatibility/run.ts"))).toHaveLength(1);
    for (const removed of [
        "tests/performance/assessment/run.ts",
        "tests/performance/delivery/run.ts",
        "tests/performance/benchmarks/run.ts",
        "tests/performance/benchmarks/collections/repository/run.ts",
    ]) {
        expect(steps.some(({ args }) => args.includes(removed))).toBe(false);
    }
});

test("perf forwards exact selections and listing to preflight without unconditional image builds", () => {
    const args = ["--scenario", "example", "--list"];
    const steps = workspaceSteps("perf", args);
    expect(steps).toHaveLength(2);
    expect(steps[0]?.args).toContain("infra/bootstrap.ts");
    expect(steps[1]?.args).toEqual(["bun", "run", "tests/performance/command/run.ts", ...args]);
});

test("performance failures still allow later journeys while failed prerequisites stop dependent stages", async () => {
    const visited: string[] = [];
    const execute = async (args: readonly string[]) => {
        visited.push(args[0]!);
        if (args[0] === "performance") {
            throw new Error("Budget failure");
        }
        return "";
    };
    await expect(
        executeWorkspace([{ args: ["performance"], continueOnFailure: true }, { args: ["tls"] }], execute),
    ).rejects.toThrow("diagnostic stages");
    expect(visited).toEqual(["performance", "tls"]);
    visited.length = 0;
    await expect(executeWorkspace([{ args: ["performance"] }, { args: ["dependent"] }], execute)).rejects.toThrow(
        "Budget failure",
    );
    expect(visited).toEqual(["performance"]);
});

test("test options alone retain maintained discovery while option values are not mistaken for paths", () => {
    const options = [
        "--test-name-pattern",
        "authorization",
        "--timeout",
        "1000",
        "--coverage-dir",
        "artifacts/coverage",
    ];
    expect(workspaceSteps("test", options).at(-1)?.args).toEqual([
        "bun",
        "test",
        "./quality",
        "./tests",
        "./packages",
        ...options,
    ]);
    const focused = ["--test-name-pattern", "authorization", "./tests/operations"];
    expect(workspaceSteps("test", focused).at(-1)?.args).toEqual(["bun", "test", ...focused]);
});
