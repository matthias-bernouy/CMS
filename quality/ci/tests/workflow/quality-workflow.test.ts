import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const workflowPath = resolve(import.meta.dir, "../../../../.github/workflows/quality.yml");
const setupActionPath = resolve(import.meta.dir, "../../../../.github/actions/setup-workspace/action.yml");
const deterministicBuildPath = resolve(import.meta.dir, "../../determinism/deterministic-build.sh");
const repositoryShapePath = resolve(import.meta.dir, "../../repository-shape/check.ts");

async function readQualityConfiguration(): Promise<string> {
    return (
        await Promise.all([
            readFile(workflowPath, "utf8"),
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
    expect(workflow).toContain("name: Quality gate");
    expect(workflow).toContain("path: coverage/");
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
