import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rename, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
    findFileSizeViolations,
    loadBaselineLines,
    loadCurrentLines,
    renamedSources,
    resolveFileSizeReference,
} from "../../repository-shape/file-size/ratchet";

const repositories: string[] = [];

afterEach(async () => {
    await Promise.all(repositories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function git(repository: string, args: string[]): void {
    const result = Bun.spawnSync(["git", ...args], { cwd: repository, stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

function gitOutput(repository: string, args: string[]): string {
    const result = Bun.spawnSync(["git", ...args], { cwd: repository, stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
    return result.stdout.toString().trim();
}

async function createRepository(): Promise<string> {
    const repository = await mkdtemp(join(tmpdir(), "cmscore-file-size-"));
    repositories.push(repository);
    git(repository, ["init", "--quiet"]);
    git(repository, ["config", "user.email", "quality@example.invalid"]);
    git(repository, ["config", "user.name", "Quality Test"]);
    return repository;
}

async function writeLines(repository: string, path: string, lineCount: number): Promise<void> {
    const absolutePath = join(repository, path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, `${Array.from({ length: lineCount }, () => "line").join("\n")}\n`);
}

function commitAll(repository: string, message: string): void {
    git(repository, ["add", "--all"]);
    git(repository, ["commit", "--quiet", "--message", message]);
}

test("file-size Git policy uses an empty baseline for a root commit", async () => {
    const repository = await createRepository();
    await writeLines(repository, "root.ts", 181);
    commitAll(repository, "root");

    expect(resolveFileSizeReference(undefined, repository)).toBeUndefined();
    expect(resolveFileSizeReference("0".repeat(40), repository)).toBeUndefined();
});

test("file-size Git policy starts its first ratchet at the policy introduction parent", async () => {
    const repository = await createRepository();
    await writeLines(repository, "legacy.ts", 200);
    commitAll(repository, "remote baseline");
    const remoteBaseline = gitOutput(repository, ["rev-parse", "HEAD"]);
    await writeLines(repository, "legacy.ts", 220);
    commitAll(repository, "work completed before policy adoption");
    const adoptionBaseline = gitOutput(repository, ["rev-parse", "HEAD"]);
    await writeLines(repository, "quality/ci/repository-shape/file-size/ratchet.ts", 10);
    commitAll(repository, "adopt file-size policy");

    const reference = resolveFileSizeReference(remoteBaseline, repository);
    expect(reference).toEndWith("^");
    expect(gitOutput(repository, ["rev-parse", reference ?? ""])).toBe(adoptionBaseline);
});

test("file-size Git policy preserves its baseline when its entry point moves", async () => {
    const repository = await createRepository();
    await writeLines(repository, "quality/ci/file-size-ratchet.ts", 10);
    commitAll(repository, "legacy policy path");
    const baseline = gitOutput(repository, ["rev-parse", "HEAD"]);
    await mkdir(join(repository, "quality/ci/repository-shape/file-size"), { recursive: true });
    await rename(
        join(repository, "quality/ci/file-size-ratchet.ts"),
        join(repository, "quality/ci/repository-shape/file-size/ratchet.ts"),
    );
    commitAll(repository, "move policy entry");
    expect(resolveFileSizeReference(baseline, repository)).toBe(baseline);
});

test("file-size Git policy includes untracked files and ignores deleted files", async () => {
    const repository = await createRepository();
    await writeLines(repository, "deleted.ts", 10);
    commitAll(repository, "tracked file");
    await unlink(join(repository, "deleted.ts"));
    await writeLines(repository, "untracked.ts", 12);

    const current = await loadCurrentLines(repository);
    expect(current.get("untracked.ts")).toBe(12);
    expect(current.has("deleted.ts")).toBeFalse();
});

test("file-size Git policy carries a governed legacy allowance through a rename", async () => {
    const repository = await createRepository();
    await writeLines(repository, "old.ts", 220);
    commitAll(repository, "legacy file");
    await rename(join(repository, "old.ts"), join(repository, "new.ts"));
    git(repository, ["add", "--all"]);

    const current = await loadCurrentLines(repository);
    const renames = renamedSources("HEAD", repository);
    const baseline = loadBaselineLines("HEAD", current, renames, repository);
    expect([...renames]).toEqual([["new.ts", "old.ts"]]);
    expect(baseline.get("old.ts")).toBe(220);
    expect(findFileSizeViolations(current, baseline, renames)).toEqual([]);
});

test("file-size Git policy never transfers an exempt schema allowance into code", async () => {
    const repository = await createRepository();
    const schema = "packages/resources/official-integrations/integrations/demo/versions/1.0.0/connectors/supabase/schema.sql";
    await writeLines(repository, schema, 220);
    commitAll(repository, "atomic schema");
    await rename(join(repository, schema), join(repository, "renamed.ts"));
    git(repository, ["add", "--all"]);

    const current = await loadCurrentLines(repository);
    const renames = renamedSources("HEAD", repository);
    const baseline = loadBaselineLines("HEAD", current, renames, repository);
    expect(baseline.size).toBe(0);
    expect(findFileSizeViolations(current, baseline, renames)[0]?.reason).toBe("new_over_limit");
});
