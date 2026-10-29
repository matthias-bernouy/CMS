import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { changedFiles, parseOptions } from "../../check-all/changes";

async function git(root: string, ...args: string[]): Promise<void> {
    const child = Bun.spawn(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const [code, error] = await Promise.all([child.exited, new Response(child.stderr).text()]);
    if (code) {
        throw new Error(error);
    }
}
test("changed files include staged, unstaged, renamed, deleted, untracked and committed work", async () => {
    const root = await mkdtemp(join(tmpdir(), "guardrail-git-"));
    try {
        await git(root, "init", "-q");
        await git(root, "config", "user.email", "test@example.invalid");
        await git(root, "config", "user.name", "Test");
        for (const name of ["staged", "unstaged", "deleted", "renamed", "committed"]) {
            await writeFile(join(root, name), name);
        }
        await git(root, "add", ".");
        await git(root, "commit", "-qm", "base");
        await git(root, "branch", "base");
        await writeFile(join(root, "committed"), "new");
        await git(root, "add", ".");
        await git(root, "commit", "-qm", "next");
        await writeFile(join(root, "staged"), "new");
        await git(root, "add", "staged");
        await writeFile(join(root, "unstaged"), "new");
        await rm(join(root, "deleted"));
        await git(root, "mv", "renamed", "new name");
        await mkdir(join(root, "new"));
        await writeFile(join(root, "new", "untracked\nfile.ts"), "new");
        expect(await changedFiles(root)).toEqual([
            "deleted",
            "new name",
            "new/untracked\nfile.ts",
            "renamed",
            "staged",
            "unstaged",
        ]);
        expect(await changedFiles(root, "base")).toContain("committed");
        expect(await changedFiles(root, "missing-reference")).toContain("committed");
        expect(await changedFiles(root, "missing-reference")).toContain("deleted");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
test("options reject missing bases, option-like references and unknown arguments", () => {
    expect(parseOptions(["--base", "main", "--verbose"])).toEqual({ base: "main", verbose: true });
    for (const args of [["--base"], ["--base", "--verbose"], ["--unknown"]]) {
        expect(() => parseOptions(args)).toThrow("Usage:");
    }
});

test("a force-pushed unrelated base broadens review to all indexed paths while repository failures still fail", async () => {
    const root = await mkdtemp(join(tmpdir(), "guardrail-force-push-"));
    try {
        await git(root, "init", "-q");
        await git(root, "config", "user.email", "test@example.invalid");
        await git(root, "config", "user.name", "Test");
        await writeFile(join(root, "unchanged.ts"), "export const value = 1;");
        await git(root, "add", ".");
        await git(root, "commit", "-qm", "old history");
        await git(root, "branch", "previous");
        await git(root, "checkout", "--orphan", "rewritten");
        await git(root, "commit", "-qm", "new history");
        expect(await changedFiles(root, "previous")).toEqual(["unchanged.ts"]);
        expect(await changedFiles(root, "f".repeat(40))).toEqual(["unchanged.ts"]);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
    await expect(changedFiles(root, "missing")).rejects.toThrow();
});
