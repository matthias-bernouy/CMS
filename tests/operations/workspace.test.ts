import { expect, test } from "bun:test";
import { workspaceSteps } from "../../infra/workspace";
import { readFile } from "node:fs/promises";

// This boundary is the public developer interface, including forwarded test arguments.
test("the root exposes exactly eight commands and forwards focused test arguments", async () => {
    const manifest = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
    expect(Object.keys(manifest.scripts).sort()).toEqual([
        "build",
        "check",
        "clean",
        "format",
        "publish",
        "test",
        "ulvia",
        "verify",
    ]);
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
    expect(steps.filter(({ args }) => args.includes("infra/images/build.ts"))).toHaveLength(1);
    expect(steps.at(-2)?.env?.ULVIA_MCP_EDGE_DOCKER_IMAGE).toBe("docker.io/cyaxis/ulvia-edge:0.1.0-verify");
    expect(steps.at(-1)?.env?.ULVIA_TLS_TEST_IMAGE).toBe("docker.io/cyaxis/ulvia-provider:0.1.0-verify");
    expect(steps.at(-2)?.args).toContain("tests/performance/delivery/run.ts");
    expect(steps.at(-1)?.args).toContain("packages/runtimes/ulvia-provider-server/tests/hosting/tls/run.ts");
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
