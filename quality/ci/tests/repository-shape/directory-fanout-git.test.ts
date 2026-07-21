import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
    listExistingCurrentPaths,
    loadBaselineDirectoryEntries,
    loadCurrentDirectoryEntries,
    resolveDirectoryFanoutReference,
} from "../../repository-shape/directory-fanout/ratchet";

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
    const repository = await mkdtemp(join(tmpdir(), "cmscore-directory-fanout-"));
    repositories.push(repository);
    git(repository, ["init", "--quiet"]);
    git(repository, ["config", "user.email", "quality@example.invalid"]);
    git(repository, ["config", "user.name", "Quality Test"]);
    return repository;
}

async function write(repository: string, path: string): Promise<void> {
    const absolutePath = join(repository, path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, "content\n");
}

function commitAll(repository: string, message: string): void {
    git(repository, ["add", "--all"]);
    git(repository, ["commit", "--quiet", "--message", message]);
}

test("directory Git policy uses an empty baseline for a root commit", async () => {
    const repository = await createRepository();
    await write(repository, "root.ts");
    commitAll(repository, "root");
    expect(resolveDirectoryFanoutReference(undefined, repository)).toBeUndefined();
    expect(resolveDirectoryFanoutReference("0".repeat(40), repository)).toBeUndefined();
    expect(() => resolveDirectoryFanoutReference("missing", repository)).toThrow("is not a commit");
});

test("directory Git policy starts at the policy introduction parent", async () => {
    const repository = await createRepository();
    await write(repository, "legacy/one.ts");
    commitAll(repository, "remote baseline");
    const remoteBaseline = gitOutput(repository, ["rev-parse", "HEAD"]);
    await write(repository, "legacy/two.ts");
    commitAll(repository, "work before adoption");
    const adoptionBaseline = gitOutput(repository, ["rev-parse", "HEAD"]);
    await write(repository, "quality/ci/repository-shape/directory-fanout/ratchet.ts");
    commitAll(repository, "adopt directory policy");
    const reference = resolveDirectoryFanoutReference(remoteBaseline, repository);
    expect(gitOutput(repository, ["rev-parse", reference ?? ""])).toBe(adoptionBaseline);
});

test("directory Git policy keeps its baseline when the ratchet entry moves", async () => {
    const repository = await createRepository();
    await write(repository, "quality/ci/repository-shape/check.ts");
    await write(repository, "quality/ci/repository-shape/directory-fanout/ratchet.ts");
    commitAll(repository, "directory policy");
    const baseline = gitOutput(repository, ["rev-parse", "HEAD"]);
    await rename(
        join(repository, "quality/ci/repository-shape/directory-fanout/ratchet.ts"),
        join(repository, "quality/ci/repository-shape/directory-fanout/entry.ts"),
    );
    commitAll(repository, "move ratchet entry");
    expect(resolveDirectoryFanoutReference(baseline, repository)).toBe(baseline);
});

test("directory Git policy includes untracked files and ignores deleted files", async () => {
    const repository = await createRepository();
    await write(repository, "folder/deleted.ts");
    commitAll(repository, "tracked file");
    await unlink(join(repository, "folder/deleted.ts"));
    await write(repository, "folder/untracked.ts");
    await write(repository, ".gitignore");
    await writeFile(join(repository, ".gitignore"), "ignored/\nnode_modules\n");
    await write(repository, "ignored/output.ts");
    await symlink("missing-dependencies", join(repository, "node_modules"));
    const paths = await listExistingCurrentPaths(repository);
    const entries = await loadCurrentDirectoryEntries(repository);
    expect(paths).toContain("folder/untracked.ts");
    expect(paths).not.toContain("folder/deleted.ts");
    expect(paths).not.toContain("ignored/output.ts");
    expect(paths).not.toContain("node_modules");
    expect([...entries.get("folder") ?? []]).toEqual(["untracked.ts"]);
});

test("directory Git policy reads immediate entries from a baseline tree", async () => {
    const repository = await createRepository();
    await write(repository, "folder/one.ts");
    await write(repository, "folder/nested/two.ts");
    commitAll(repository, "tree");
    const baseline = loadBaselineDirectoryEntries("HEAD", repository);
    expect([...baseline.get("folder") ?? []]).toEqual(["nested", "one.ts"]);
});
