import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { listCurrentRepositoryPaths } from "../../repository-shape/files";
import {
    loadCurrentDirectoryEntries,
    runDirectoryFanoutCheck,
    runDirectoryFanoutCommand,
} from "../../repository-shape/directory-fanout/check";
import { loadCurrentLines, runFileSizeCheck } from "../../repository-shape/file-size/check";
import { runRepositoryShapeCheck } from "../../repository-shape/check";

const repositories: string[] = [];

afterEach(async () => {
    await Promise.all(repositories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function git(repository: string, args: string[]): void {
    const result = Bun.spawnSync(["git", ...args], { cwd: repository, stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) {
        throw new Error(result.stderr.toString());
    }
}

async function createRepository(): Promise<string> {
    const repository = await mkdtemp(join(tmpdir(), "cmscore-shape-guidance-"));
    repositories.push(repository);
    git(repository, ["init", "--quiet"]);
    return repository;
}

async function write(repository: string, path: string, contents = "content\n"): Promise<void> {
    const absolutePath = join(repository, path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents);
}

test("current repository scan includes untracked files and excludes ignored and deleted files", async () => {
    const repository = await createRepository();
    await write(repository, "folder/deleted.ts");
    git(repository, ["add", "--all"]);
    await unlink(join(repository, "folder/deleted.ts"));
    await write(repository, "folder/untracked.ts", "one\ntwo\n");
    await write(repository, ".gitignore", "ignored/\nnode_modules\n");
    await write(repository, "ignored/output.ts");
    await symlink("missing-dependencies", join(repository, "node_modules"));

    const paths = await listCurrentRepositoryPaths(repository);
    const lines = await loadCurrentLines(repository);
    const directories = await loadCurrentDirectoryEntries(repository);
    expect(paths).toContain("folder/untracked.ts");
    expect(paths).not.toContain("folder/deleted.ts");
    expect(paths).not.toContain("ignored/output.ts");
    expect(paths).not.toContain("node_modules");
    expect(lines.get("folder/untracked.ts")).toBe(2);
    expect([...(directories.get("folder") ?? [])]).toEqual(["untracked.ts"]);
});

test("current repository scan still fails when Git cannot inspect the workspace", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cmscore-shape-not-git-"));
    repositories.push(directory);
    expect(listCurrentRepositoryPaths(directory)).rejects.toThrow("Cannot list current repository files");
});

test("wide directories make direct and aggregate repository-shape checks fail", async () => {
    const repository = await createRepository();
    await write(repository, "large.ts", "line\n".repeat(181));
    for (let index = 0; index < 9; index += 1) {
        await write(repository, `wide/entry-${index}.ts`);
    }
    const messages: string[] = [];
    const report = (message: string) => messages.push(message);

    expect(await runFileSizeCheck(repository, report)).toContainEqual({
        path: "large.ts",
        currentLines: 181,
        severity: "warning",
    });
    expect(await runDirectoryFanoutCheck(repository, report)).toContainEqual({
        path: "wide",
        currentEntries: 9,
        severity: "error",
    });
    expect(await runDirectoryFanoutCommand(repository, () => undefined)).toBe(1);
    expect(await runRepositoryShapeCheck(repository, () => undefined)).toBe(1);
    expect(messages).toContain("File-size guidance: 0 info, 1 warnings. Findings are advisory.");
    expect(messages).toContain("Directory-fanout policy: 0 info, 1 errors. Errors are blocking.");
});
