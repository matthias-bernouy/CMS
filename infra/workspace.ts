import { command } from "./process";
import { testArguments } from "./test-arguments";

export type WorkspaceStep = { args: string[]; env?: Record<string, string | undefined> };
const bootstrap = { args: ["bun", "run", "infra/bootstrap.ts"] };
const browser = { args: ["bun", "run", "--cwd", "packages/features/content", "build:browser"] };
const tests = ["./quality", "./tests", "./packages"];
const candidateVersion = "0.1.0-verify";
const candidateImages = {
    ULVIA_SMOKE_IMAGE_VERSION: candidateVersion,
    ULVIA_MCP_EDGE_DOCKER_IMAGE: `docker.io/cyaxis/ulvia-edge:${candidateVersion}`,
    ULVIA_MCP_PROVIDER_DOCKER_IMAGE: `docker.io/cyaxis/ulvia-provider:${candidateVersion}`,
    ULVIA_TLS_TEST_IMAGE: `docker.io/cyaxis/ulvia-provider:${candidateVersion}`,
};

/** Each public command owns preparation once; nested stages consume its outputs. */
export function workspaceSteps(action: string | undefined, args: string[]): WorkspaceStep[] {
    if (action === "ulvia") {
        return [bootstrap, browser, { args: ["bun", "run", "packages/runtimes/ulvia-cli/src/index.ts", ...args] }];
    }
    if (action === "check") {
        return [bootstrap, { args: ["bun", "run", "quality/ci/check-all/index.ts", ...args] }];
    }
    if (action === "test") {
        return [bootstrap, browser, { args: ["bun", "test", ...testArguments(args)] }];
    }
    if (action !== "verify" || args.length) {
        throw new Error("Usage: bun run <check | test | ulvia> [arguments], or bun run verify");
    }
    return [
        bootstrap,
        { args: ["bun", "run", "quality/ci/check-all/index.ts"] },
        browser,
        { args: ["bun", "test", ...tests] },
        { args: ["bun", "x", "tsc", "--project", "quality/performance/tsconfig.json"] },
        { args: ["bun", "run", "quality/performance/run.ts"] },
        { args: ["bun", "run", "infra/images/build.ts", "build", "--version", candidateVersion] },
        {
            args: ["bun", "test", "packages/runtimes/ulvia-cli/tests/stack/edge-smoke.browser.test.ts"],
            env: { ...candidateImages, ULVIA_RUN_EDGE_SMOKE: "1" },
        },
        { args: ["bun", "run", "tests/performance/delivery/run.ts"], env: candidateImages },
        {
            args: ["bun", "run", "packages/runtimes/ulvia-provider-server/tests/hosting/tls/run.ts"],
            env: candidateImages,
        },
    ];
}

if (import.meta.main) {
    const [action, ...args] = Bun.argv.slice(2);
    for (const step of workspaceSteps(action, args)) {
        await command(step.args, { env: step.env });
    }
}
