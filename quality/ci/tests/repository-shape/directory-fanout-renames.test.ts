import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
    collectDirectoryEntries,
    findDirectoryFanoutViolations,
    inferPureDirectoryRenames,
    listBaselinePaths,
    listExistingCurrentPaths,
} from "../../repository-shape/directory-fanout/ratchet";
import { renamedSources } from "../../repository-shape/file-size/ratchet";

let repository: string | undefined;

afterEach(async () => {
    if (repository) await rm(repository, { recursive: true, force: true });
    repository = undefined;
});

function git(args: string[]): void {
    const result = Bun.spawnSync(["git", ...args], { cwd: repository, stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

async function write(path: string): Promise<void> {
    const absolutePath = join(repository!, path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, "content\n");
}

async function createLegacyRepository(): Promise<void> {
    repository = await mkdtemp(join(tmpdir(), "cmscore-directory-rename-"));
    git(["init", "--quiet"]);
    git(["config", "user.email", "quality@example.invalid"]);
    git(["config", "user.name", "Quality Test"]);
    for (let index = 0; index < 9; index += 1) await write(`old/nested/entry-${index}.ts`);
    git(["add", "--all"]);
    git(["commit", "--quiet", "--message", "legacy directory"]);
}

test("directory Git policy carries staged nested moves and detects growth", async () => {
    await createLegacyRepository();
    await mkdir(join(repository!, "group"));
    await rename(join(repository!, "old"), join(repository!, "group/new"));
    git(["add", "--all"]);

    const baselinePaths = listBaselinePaths("HEAD", repository);
    let currentPaths = await listExistingCurrentPaths(repository);
    let directories = inferPureDirectoryRenames(
        baselinePaths,
        currentPaths,
        renamedSources("HEAD", repository),
    );
    expect(directories.get("group/new/nested")).toBe("old/nested");
    expect(findDirectoryFanoutViolations(
        collectDirectoryEntries(currentPaths),
        collectDirectoryEntries(baselinePaths),
        directories,
    )).toEqual([]);

    await write("group/new/nested/entry-9.ts");
    currentPaths = await listExistingCurrentPaths(repository);
    directories = inferPureDirectoryRenames(baselinePaths, currentPaths, renamedSources("HEAD", repository));
    expect(findDirectoryFanoutViolations(
        collectDirectoryEntries(currentPaths),
        collectDirectoryEntries(baselinePaths),
        directories,
    )).toContainEqual({
        path: "group/new/nested",
        currentEntries: 10,
        allowedEntries: 9,
        reason: "legacy_growth",
    });
});
