import { expect, test } from "bun:test";
import { executeWorkspace, workspaceSteps } from "../../infra/workspace";

test("focused test arguments are forwarded and verify rejects partial selection", () => {
    const args = ["./packages/features/auth/tests", "--test-name-pattern", "authorization"];
    expect(workspaceSteps("test", args).at(-1)?.args).toEqual(["bun", "test", ...args]);
    expect(() => workspaceSteps("verify", ["--only", "tests"])).toThrow("Usage:");
});

test("verify prepares each prerequisite once and includes browser, Docker and TLS acceptance", () => {
    const steps = workspaceSteps("verify", []);
    expect(steps.filter(({ args }) => args.includes("infra/bootstrap.ts"))).toHaveLength(1);
    expect(steps.filter(({ args }) => args.includes("build:browser"))).toHaveLength(1);
    expect(steps.find(({ env }) => env?.ULVIA_RUN_EDGE_SMOKE === "1")?.args).toContain(
        "packages/runtimes/ulvia-cli/tests/stack/edge-smoke.browser.test.ts",
    );
    expect(steps.find(({ env }) => env?.ULVIA_RUN_CONTENT_LIFECYCLE === "1")).toMatchObject({
        args: ["bun", "test", "./tests/integration/content"],
        continueOnFailure: true,
    });
    expect(steps.filter(({ args }) => args.includes("infra/images/build.ts"))).toHaveLength(1);
    expect(
        steps.find(({ args }) => args.includes("tests/performance/delivery/run.ts"))?.env?.ULVIA_MCP_EDGE_DOCKER_IMAGE,
    ).toBe("docker.io/cyaxis/ulvia-edge:0.1.0-verify");
    expect(steps.at(-1)?.env?.ULVIA_TLS_TEST_IMAGE).toBe("docker.io/cyaxis/ulvia-provider:0.1.0-verify");
    expect(steps.at(-2)?.args).toContain("tests/performance/assessment/run.ts");
    expect(steps.some(({ args }) => args.includes("tests/performance/benchmarks/collections/repository/run.ts"))).toBe(
        true,
    );
    expect(steps.at(-1)?.args).toContain("packages/runtimes/ulvia-provider-server/tests/hosting/tls/run.ts");
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
