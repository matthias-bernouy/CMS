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
        {
            args: ["bun", "test", ...tests],
            env: { ULVIA_RUN_FORMS_MONGO: "0", ULVIA_RUN_FORMS_JOURNEY: "0" },
            continueOnFailure: true,
        },
        {
            args: ["bun", "test", "./tests/integration/collections/animations.browser.test.ts"],
            env: { ULVIA_RUN_COLLECTION_STYLE_BROWSER: "1" },
            continueOnFailure: true,
        },
        {
            args: [
                "bun",
                "test",
                "packages/foundation/browser-capture/tests/capture.browser.test.ts",
                "packages/foundation/browser-capture/tests/sandbox.browser.test.ts",
                "packages/surfaces/ulvia-provider/tests/capabilities/content/captures/journey.browser.test.ts",
                "packages/runtimes/ulvia-cli/tests/preview/capture.browser.test.ts",
                "packages/runtimes/ulvia-cli/tests/preview/bundled.browser.test.ts",
                "packages/runtimes/ulvia-cli/tests/preview/native-worker.browser.test.ts",
            ],
            env: { ULVIA_RUN_CAPTURE_BROWSER: "1", ULVIA_RUN_EXAMPLE_BROWSER: "1" },
            continueOnFailure: true,
        },
        {
            args: [
                "bun",
                "test",
                "./tests/integration/content",
                "./tests/integration/observability",
                "./tests/integration/email-templates",
            ],
            env: {
                ULVIA_RUN_CONTENT_LIFECYCLE: "1",
                ULVIA_RUN_CLUSTER_LOGS_MONGO: "1",
                ULVIA_RUN_EMAIL_TEMPLATES_MONGO: "1",
            },
            continueOnFailure: true,
        },
        {
            args: [
                "bun",
                "test",
                "packages/features/auth/tests/accounts/events/mongo.test.ts",
                "packages/features/forms/tests/mongo.test.ts",
                "packages/features/forms/tests/mongo-lists.test.ts",
                "packages/features/forms/tests/events/initiator.mongo.test.ts",
                "packages/features/forms/tests/migration/mongo.test.ts",
                "packages/runtimes/ulvia-provider-server/tests/provider-contracts/native/bootstrap/migrations/forms.mongo.test.ts",
                "packages/features/events/tests",
                "packages/features/workflows/tests/mongo.test.ts",
                "packages/features/workflows/tests/resources/mongo-installations.test.ts",
            ],
            env: {
                ULVIA_RUN_ACCESS_EVENTS_MONGO: "1",
                ULVIA_RUN_FORMS_MONGO: "1",
                ULVIA_RUN_FORMS_MIGRATION_MONGO: "1",
                ULVIA_RUN_EVENTS_MONGO: "1",
                ULVIA_RUN_WORKFLOWS_MONGO: "1",
            },
            continueOnFailure: true,
        },
        { args: ["bun", "x", "tsc", "--project", "tests/performance/tsconfig.json"] },
        { args: ["bun", "run", "tests/performance/command/check.ts"] },
        { args: ["bun", "run", "tests/performance/compatibility/run.ts"], continueOnFailure: true },
        candidateImageStep(candidateVersion),
        {
            args: ["bun", "test", "tests/integration/instance/accounts/journey.test.ts"],
            env: { ...candidateImages, ULVIA_RUN_ACCESS_EVENTS_JOURNEY: "1" },
            continueOnFailure: true,
        },
        {
            args: ["bun", "test", "tests/integration/instance/forms/journey.test.ts"],
            env: { ...candidateImages, ULVIA_RUN_FORMS_JOURNEY: "1" },
            continueOnFailure: true,
        },
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
