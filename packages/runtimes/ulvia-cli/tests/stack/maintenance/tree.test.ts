import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, readFile, rm, lstat, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { backupTree } from "../../../src/runtime/maintenance/backup/tree";
async function fixture() {
    const root = await mkdtemp(join(tmpdir(), "ulvia-backup-tree-"));
    const data = join(root, "data"),
        backup = join(root, "snapshot");
    await mkdir(data);
    await mkdir(backup);
    return { root, data, backup, uid: process.getuid!(), gid: process.getgid!() };
}
test("cold tree snapshot restores data and secrets while preserving both native lock inodes", async () => {
    const f = await fixture();
    try {
        await mkdir(join(f.data, "repository"));
        await mkdir(join(f.data, "services"));
        await writeFile(join(f.data, ".write-lock"), "root-lock");
        await writeFile(join(f.data, "repository/.write-lock"), "repository-lock");
        await writeFile(join(f.data, ".maintenance.json"), "active-recovery");
        await writeFile(join(f.data, "services/key"), "private-key", { mode: 0o600 });
        await writeFile(join(f.data, "repository/release"), Buffer.alloc(1024 * 1024, 17));
        const inode = (await lstat(join(f.data, "repository/.write-lock"))).ino;
        const captured = await backupTree({ ...f, mode: "create" });
        expect(captured.files).toBe(2);
        await writeFile(join(f.data, "services/key"), "new-key");
        await writeFile(join(f.data, "new-state"), "after-snapshot");
        expect(await backupTree({ ...f, mode: "restore" })).toEqual(captured);
        expect(await readFile(join(f.data, "services/key"), "utf8")).toBe("private-key");
        expect((await lstat(join(f.data, "repository/.write-lock"))).ino).toBe(inode);
        expect(await readFile(join(f.data, ".maintenance.json"), "utf8")).toBe("active-recovery");
        expect(await Bun.file(join(f.data, "new-state")).exists()).toBe(false);
        expect((await lstat(join(f.backup, "payload/services/key"))).mode & 0o077).toBe(0);
    } finally {
        await rm(f.root, { recursive: true, force: true });
    }
});
test("tampered, extra and linked backup members refuse before any live data is removed", async () => {
    for (const kind of ["tamper", "extra", "link", "traversal"]) {
        const f = await fixture();
        try {
            await writeFile(join(f.data, "business"), "original");
            await backupTree({ ...f, mode: "create" });
            await writeFile(join(f.data, "business"), "current");
            if (kind === "tamper") {
                await writeFile(join(f.backup, "payload/business"), "tampered");
            }
            if (kind === "extra") {
                await writeFile(join(f.backup, "payload/unlisted"), "extra");
            }
            if (kind === "link") {
                await rm(join(f.backup, "payload/business"));
                await symlink(join(f.data, "business"), join(f.backup, "payload/business"));
            }
            if (kind === "traversal") {
                const tree = JSON.parse(await readFile(join(f.backup, "tree.json"), "utf8"));
                tree.entries[0].path = "../business";
                await writeFile(join(f.backup, "tree.json"), JSON.stringify(tree));
            }
            await expect(backupTree({ ...f, mode: "restore" })).rejects.toThrow();
            expect(await readFile(join(f.data, "business"), "utf8")).toBe("current");
        } finally {
            await rm(f.root, { recursive: true, force: true });
        }
    }
});
test("capture refuses symlinks and the serialized worker executes without ambient module bindings", async () => {
    const f = await fixture();
    try {
        await writeFile(join(f.data, "data"), "value");
        const child = Bun.spawn(
            [
                process.execPath,
                "--no-macros",
                "-e",
                `const run=${backupTree.toString()};console.log(JSON.stringify(await run(JSON.parse(process.argv[1]))));`,
                JSON.stringify({ ...f, mode: "create" }),
            ],
            { stdout: "pipe", stderr: "pipe" },
        );
        const output = await new Response(child.stdout).text();
        expect(await child.exited, await new Response(child.stderr).text()).toBe(0);
        expect(JSON.parse(output).files).toBe(1);
        await symlink("/etc/passwd", join(f.data, "link"));
        const second = join(f.root, "second");
        await mkdir(second);
        await expect(backupTree({ ...f, backup: second, mode: "create" })).rejects.toThrow("link");
    } finally {
        await rm(f.root, { recursive: true, force: true });
    }
});
