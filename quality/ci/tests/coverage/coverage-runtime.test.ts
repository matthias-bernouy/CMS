import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { compareWithReference } from "../../coverage/policy/regression";
import type { CoverageBaseline } from "../../coverage/types";
import { packageCoverage } from "./coverage-fixtures";

const repositories: string[] = [];
const snapshot = (bunVersion: string): CoverageBaseline => ({
    schemaVersion: 1,
    bunVersion,
    packages: { "@example/package": packageCoverage() },
});

afterEach(async () => {
    await Promise.all(repositories.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function reference(runtime: string, baselineVersion: string, invalidCounts = false) {
    const root = await mkdtemp("/tmp/ulvia-coverage-runtime-");
    repositories.push(root);
    await mkdir(join(root, "quality/ci/coverage"), { recursive: true });
    await writeFile(join(root, ".bun-version"), `${runtime}\n`);
    const baseline = snapshot(baselineVersion);
    if (invalidCounts) {
        baseline.packages["@example/package"]!.files.total += 2;
    }
    await writeFile(join(root, "quality/ci/coverage/baseline.json"), JSON.stringify(baseline));
    for (const args of [
        ["init", "--quiet"],
        ["config", "user.email", "quality@example.invalid"],
        ["config", "user.name", "Quality Test"],
        ["add", "--all"],
        ["commit", "--quiet", "--message", "runtime and coverage baseline"],
    ]) {
        const result = Bun.spawnSync(["git", ...args], { cwd: root, stderr: "pipe", stdout: "pipe" });
        if (result.exitCode !== 0) {
            throw new Error(result.stderr.toString());
        }
    }
    return root;
}

test("reconciles coverage after an already-committed Bun migration only against its exact measurement", async () => {
    const root = await reference("1.4.4", "1.4.2");
    const current = snapshot("1.4.4");
    expect(compareWithReference("HEAD", current, structuredClone(current), root)).toEqual([]);
    const changed = structuredClone(current);
    changed.packages["@example/package"]!.lines.covered -= 1;
    expect(compareWithReference("HEAD", current, changed, root)).toEqual([
        "reconciled runtime baseline/@example/package: committed coverage must exactly match the measured package snapshot",
    ]);
    expect(compareWithReference("HEAD", changed, current, root)).toHaveLength(1);
});

test("a baseline version change cannot invent a runtime migration", async () => {
    const root = await reference("1.4.2", "1.4.2");
    const current = snapshot("1.4.4");
    expect(compareWithReference("HEAD", current, current, root)).toEqual([
        "target branch baseline uses Bun 1.4.2, current baseline uses 1.4.4",
    ]);
});

test("a reconciled runtime keeps the normal coverage ratchet on later commits", async () => {
    const root = await reference("1.4.4", "1.4.4");
    const lowered = snapshot("1.4.4");
    lowered.packages["@example/package"]!.lines.covered -= 1;
    expect(compareWithReference("HEAD", lowered, lowered, root)).toContain(
        "committed baseline/@example/package: lines decreased from 80.00% to 79.00%",
    );
});

test("replaces inconsistent obsolete measurements without repairing their historical counters", async () => {
    const root = await reference("1.4.4", "1.4.2", true);
    const current = snapshot("1.4.4");
    expect(compareWithReference("HEAD", current, structuredClone(current), root)).toEqual([]);
});

test("inconsistent reference counts remain invalid on the current runtime", async () => {
    const root = await reference("1.4.4", "1.4.4", true);
    const current = snapshot("1.4.4");
    expect(() => compareWithReference("HEAD", current, current, root)).toThrow(
        "does not match its exact source-file lists",
    );
});
