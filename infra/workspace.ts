import { command } from "./process";
import { testArguments } from "./test-arguments";
import { browserBuildStep, candidateEnvironment, candidateImageStep } from "./images/candidate";

export type WorkspaceStep = { args: string[]; env?: Record<string, string | undefined>; continueOnFailure?: boolean };
const bootstrap = { args: ["bun", "run", "infra/bootstrap.ts"] };
const browser = browserBuildStep;
const tests = ["./quality", "./tests", "./packages"];
const candidateVersion = "0.1.0-verify";
const candidateImages = candidateEnvironment(candidateVersion);

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
    if (action === "perf") {
        return [bootstrap, { args: ["bun", "run", "tests/performance/command/run.ts", ...args] }];
    }
    if (action !== "verify" || args.length) {
        throw new Error("Usage: bun run <check | test | perf | ulvia> [arguments], or bun run verify");
    }
    return [
        bootstrap,
        { args: ["bun", "run", "quality/ci/check-all/index.ts"] },
        browser,
        { args: ["bun", "test", ...tests], continueOnFailure: true },
        {
            args: ["bun", "test", "./tests/integration/content"],
            env: { ULVIA_RUN_CONTENT_LIFECYCLE: "1" },
            continueOnFailure: true,
        },
        { args: ["bun", "x", "tsc", "--project", "tests/performance/tsconfig.json"] },
        { args: ["bun", "run", "tests/performance/command/check.ts"] },
        { args: ["bun", "run", "tests/performance/compatibility/run.ts"], continueOnFailure: true },
        candidateImageStep(candidateVersion),
        {
            args: ["bun", "test", "packages/runtimes/ulvia-cli/tests/stack/edge-smoke.browser.test.ts"],
            env: { ...candidateImages, ULVIA_RUN_EDGE_SMOKE: "1" },
            continueOnFailure: true,
        },
        {
            args: ["bun", "run", "packages/runtimes/ulvia-provider-server/tests/hosting/tls/run.ts"],
            env: candidateImages,
        },
    ];
}

/** Diagnostic stage failures remain fatal overall, but must not hide later acceptance evidence. */
export async function executeWorkspace(steps: readonly WorkspaceStep[], execute = command): Promise<void> {
    const failures: string[] = [];
    for (const step of steps) {
        try {
            await execute(step.args, { env: step.env });
        } catch (error) {
            if (!step.continueOnFailure) {
                throw error;
            }
            failures.push(step.args.join(" "));
        }
    }
    if (failures.length) {
        throw new Error(`Verification failed in ${failures.length} diagnostic stages:\n${failures.join("\n")}`);
    }
}

if (import.meta.main) {
    const [action, ...args] = Bun.argv.slice(2);
    await executeWorkspace(workspaceSteps(action, args));
}
