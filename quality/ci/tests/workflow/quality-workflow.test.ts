import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const workflowPath = resolve(import.meta.dir, "../../../../.github/workflows/quality.yml");
const integrationWorkflowPath = resolve(
    import.meta.dir,
    "../../../../.github/workflows/quality-integration-contracts.yml",
);
const setupActionPath = resolve(import.meta.dir, "../../../../.github/actions/setup-workspace/action.yml");
const deterministicBuildPath = resolve(import.meta.dir, "../../determinism/deterministic-build.sh");
const repositoryShapePath = resolve(import.meta.dir, "../../repository-shape/check.ts");

async function readQualityConfiguration(): Promise<string> {
    return (
        await Promise.all([
            readFile(workflowPath, "utf8"),
            readFile(integrationWorkflowPath, "utf8"),
            readFile(setupActionPath, "utf8"),
            readFile(deterministicBuildPath, "utf8"),
            readFile(repositoryShapePath, "utf8"),
        ])
    ).join("\n");
}

test("quality workflow pins external actions and the secret scanner", async () => {
    const workflow = await readFile(workflowPath, "utf8");
    const configuration = await readQualityConfiguration();

    expect(workflow).toContain("actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2");
    expect(configuration).toContain("oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0");
    expect(workflow).toContain("GITLEAKS_VERSION: 8.30.1");
    expect(workflow).toContain(
        "GITLEAKS_ARCHIVE_SHA256: 551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb",
    );
    expect(workflow).toContain("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2");
    expect(configuration).not.toMatch(/uses:\s+[^\s]+@(main|master|v\d+)\s*$/m);
    const actionReferences = [...configuration.matchAll(/uses:\s+[^\s]+@([^\s]+)/g)].flatMap((match) =>
        match[1] ? [match[1]] : [],
    );
    expect(actionReferences.length).toBeGreaterThan(0);
    expect(actionReferences.every((reference) => /^[0-9a-f]{40}$/.test(reference))).toBeTrue();
});

test("quality workflow keeps every G0 check visible", async () => {
    const workflow = await readFile(workflowPath, "utf8");
    const integrationWorkflow = await readFile(integrationWorkflowPath, "utf8");
    const configuration = await readQualityConfiguration();

    for (const command of [
        "bun install --frozen-lockfile",
        "bun run check:all",
        "runDirectoryFanoutCheck",
        "runFileSizeCheck",
        "bun run build",
        "bun run quality/ci/determinism/build-manifest.ts",
        "bun run clean",
        "diff --unified",
        "git diff --exit-code",
        "bun run quality/ci/audit/audit.ts",
        "bun run quality/ci/coverage/ratchet.ts",
        "bun run --cwd packages/foundation/components build",
        "docker compose version",
        "bun run packages/resources/official-integrations/tests/helpers/postgres/runPostgresContracts.ts --filter commerce-media",
        "bun run packages/resources/official-integrations/tests/helpers/postgres/runPostgresContracts.ts --filter commerce-negotiated-checkout",
        "bun run packages/resources/official-integrations/tests/helpers/postgres/schema-calibration/execution/baselines/generateBaselines.ts --check",
        "bun test packages/features/cms-source-images/tests",
        "packages/features/cms-sources/tests/http/interceptors",
        "packages/features/cms-sources/tests/http/observability/sourceImageTelemetry.test.ts",
        "packages/features/cms-sources/tests/validation/validateSource.reservedParams.test.ts",
        "packages/resources/official-integrations/tests/commerce/selling/media/uploads",
        "packages/resources/official-integrations/tests/commerce/selling/blocs/offer-preview-money.test.ts",
        "bun test quality/image-performance/tests",
        "bun node_modules/playwright/cli.js install --with-deps chromium",
        "--synthetic 2",
        "bun run quality/image-performance/browser/run.ts",
        "bun run quality/image-performance/compare/smoke.ts",
    ]) {
        expect(configuration).toContain(command);
    }
    for (const testPath of [
        "packages/foundation",
        "packages/features",
        "packages/resources",
        "packages/surfaces",
        "packages/runtimes",
        "infra",
        "quality",
    ]) {
        expect(workflow).toContain(`path: ${testPath}`);
    }
    expect(workflow).toContain(
        "COVERAGE_BASELINE_REF: ${{ github.event.pull_request.base.sha || github.event.before }}",
    );
    expect(workflow).not.toContain("REPOSITORY_SHAPE_BASELINE_REF");
    expect(workflow).not.toContain("continue-on-error");
    expect(workflow).not.toContain("run: bun run check:architecture");
    expect(workflow).not.toContain("run: bun run check:repository-shape");
    expect(workflow).toMatch(
        /name: Install Chromium for surface browser tests\s+if: matrix\.name == 'surfaces'\s+run: bun node_modules\/playwright\/cli\.js install --with-deps chromium/,
    );
    expect(workflow).toContain("uses: ./.github/workflows/quality-integration-contracts.yml");
    expect(integrationWorkflow).toContain("name: PostgreSQL integration contracts");
    expect(integrationWorkflow).toContain(
        "image: postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777",
    );
    expect(integrationWorkflow).toContain("POSTGRES_DB: cmscore_contracts");
    expect(integrationWorkflow).toContain("ALLOW_POSTGRES_CONTRACT_SCHEMA_RESET: cmscore-postgres-contracts");
    expect(integrationWorkflow).toContain(
        "DATABASE_URL: postgres://postgres:postgres@127.0.0.1:5432/cmscore_contracts",
    );
    expect(integrationWorkflow).toContain("name: Calibrate and verify all official PostgreSQL schema baselines");
    expect(integrationWorkflow).toContain("docker run --rm --network host");
    expect(integrationWorkflow).toContain('--volume "$GITHUB_WORKSPACE:/workspace:ro"');
    expect(integrationWorkflow).toContain(
        "oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0",
    );
    expect(integrationWorkflow).toContain(
        "CMS_SCHEMA_BASELINE_GENERATOR_IMAGE: oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0",
    );
    expect(integrationWorkflow).toContain("--env CMS_SCHEMA_BASELINE_GENERATOR_IMAGE");
    expect(integrationWorkflow).not.toContain("generateBaselines.ts --check --filter");
    expect(integrationWorkflow).toMatch(/postgres-contracts:[\s\S]*fetch-depth: 0/);
    expect(integrationWorkflow).toContain("name: Source image safety and Chromium smoke");
    expect(integrationWorkflow).toContain("PLAYWRIGHT_BROWSERS_PATH: ${{ runner.temp }}/playwright");
    expect(integrationWorkflow).toContain("--suite-id source-images-ci-smoke");
    expect(workflow).toContain("INTEGRATION_RESULT: ${{ needs.integration-contracts.result }}");
    expect(workflow).toContain("name: Quality gate");
    expect(workflow).toContain("path: coverage/");
});

test("source image CI uses the real adapter with deterministic public fixtures only", async () => {
    const workflow = await readFile(workflowPath, "utf8");
    const integrationWorkflow = await readFile(integrationWorkflowPath, "utf8");
    const job = integrationWorkflow.match(/\n  source-image-safety:[\s\S]*$/)?.[0];
    const qualityGate = workflow.match(/\n  quality-gate:[\s\S]*$/)?.[0];

    expect(job).toBeDefined();
    expect(job).toContain("bun test packages/features/cms-source-images/tests");
    expect(job).toContain("packages/resources/official-integrations/tests/commerce/selling/media/uploads");
    expect(job).toContain("bun test quality/image-performance/tests");
    expect(job).toContain("bun node_modules/playwright/cli.js install --with-deps chromium");
    expect(job).toContain("--adapter module:quality/image-performance/core/sourceImagesAdapter.ts");
    expect(job).toContain("--synthetic 2");
    expect(job).toContain("bun run quality/image-performance/browser/run.ts");
    expect(job).toContain("bun run quality/image-performance/compare/smoke.ts");
    expect(job).not.toContain("IMAGE_CORPUS_DIR");
    expect(job).not.toMatch(/\s--corpus(?:\s|$)/);
    expect(job).not.toContain("compare:image-performance");
    expect(job).not.toContain("quality/image-performance/compare/run.ts");
    expect(qualityGate).toContain("- integration-contracts");
    expect(qualityGate).toContain('test "$INTEGRATION_RESULT" = success');
});

test("secret baseline contains only the audited historical fingerprints", async () => {
    const baselinePath = resolve(import.meta.dir, "../../audit/gitleaks-baseline.txt");
    const fingerprints = (await readFile(baselinePath, "utf8"))
        .split(/\r?\n/)
        .filter((line) => line.length > 0 && !line.startsWith("#"));

    expect(fingerprints).toHaveLength(25);
    expect(new Set(fingerprints).size).toBe(25);
    for (const fingerprint of fingerprints) {
        expect(fingerprint).toMatch(/^[0-9a-f]{40}:.+:[a-z0-9-]+:\d+$/);
    }
});
