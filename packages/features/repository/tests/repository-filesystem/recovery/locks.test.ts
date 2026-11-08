import { expect, test } from "bun:test";
import { readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { acquireFilesystemLease } from "repository/repository/filesystem/core/lock";
import { manifest, uploadFixture } from "./uploadFixtures";

async function holdInChild(path: string) {
    const child = Bun.spawn(
        [
            process.execPath,
            "--no-macros",
            "-e",
            `import { acquireFilesystemLease } from "@bernouy/repository/repository/filesystem";
         await acquireFilesystemLease(Bun.argv.at(-1), { createParent: false });
         console.log("ready"); await new Promise(() => {});`,
            path,
        ],
        { stdout: "pipe", stderr: "pipe" },
    );
    const reader = child.stdout.getReader();
    const output = await reader.read();
    reader.releaseLock();
    expect(new TextDecoder().decode(output.value).trim()).toBe("ready");
    return child;
}

test("contenders cannot take or release a live lease; release retains one stable lock inode", async () => {
    const f = await uploadFixture();
    try {
        const path = join(f.root, ".lease");
        const lease = await acquireFilesystemLease(path);
        const identity = await stat(path, { bigint: true });
        try {
            const results = await Promise.allSettled(Array.from({ length: 16 }, () => acquireFilesystemLease(path)));
            expect(results.every((result) => result.status === "rejected")).toBeTrue();
            const child = Bun.spawn(
                [
                    process.execPath,
                    "--no-macros",
                    "-e",
                    `import { acquireFilesystemLease } from "@bernouy/repository/repository/filesystem";
                 try { await acquireFilesystemLease(Bun.argv.at(-1)); process.exit(1); }
                 catch (e) { if (e.name !== "FilesystemLeaseBusyError") throw e; }`,
                    path,
                ],
                { stdout: "pipe", stderr: "pipe" },
            );
            expect(await child.exited).toBe(0);
            await lease.assertOwnership();
        } finally {
            await lease.release();
        }
        await lease.release();
        await expect(lease.assertOwnership()).rejects.toThrow("ownership was lost");
        expect((await stat(path, { bigint: true })).ino).toBe(identity.ino);
        const next = await acquireFilesystemLease(path);
        await next.assertOwnership();
        await next.release();
    } finally {
        await f.close();
    }
});

test("SIGKILL releases a fresh lease immediately, without stale-time or PID checks", async () => {
    const f = await uploadFixture();
    try {
        const path = join(f.root, ".lease");
        const child = await holdInChild(path);
        try {
            await expect(acquireFilesystemLease(path)).rejects.toThrow("already held");
        } finally {
            child.kill("SIGKILL");
            await child.exited;
        }
        const candidates = await Promise.allSettled(Array.from({ length: 16 }, () => acquireFilesystemLease(path)));
        const winners = candidates.filter((result) => result.status === "fulfilled");
        expect(winners).toHaveLength(1);
        for (const winner of winners) {
            await winner.value.assertOwnership();
            await winner.value.release();
        }
    } finally {
        await f.close();
    }
});

test("independent processes serialize read-modify-write without losing updates", async () => {
    const f = await uploadFixture();
    try {
        const counter = join(f.root, "counter");
        await writeFile(counter, "0");
        const source = `
            import { withRepositoryWriteLock } from "@bernouy/repository/repository/filesystem";
            import { readFile, writeFile } from "node:fs/promises";
            import { join } from "node:path";
            const root = Bun.argv.at(-1); const path = join(root, "counter");
            for(let i=0; i<10; i++) await withRepositoryWriteLock(root, async () => {
                const value = Number(await readFile(path, "utf8"));
                await Bun.sleep(2); await writeFile(path, String(value + 1));
            });`;
        const children = Array.from({ length: 4 }, () =>
            Bun.spawn([process.execPath, "--no-macros", "-e", source, f.root], { stdout: "pipe", stderr: "pipe" }),
        );
        for (const child of children) {
            expect({ code: await child.exited, errors: await new Response(child.stderr).text() }).toEqual({
                code: 0,
                errors: "",
            });
        }
        expect(await readFile(counter, "utf8")).toBe("40");
    } finally {
        await f.close();
    }
});

test("an upload can commit immediately after its previous lock holder is killed", async () => {
    const f = await uploadFixture();
    try {
        const store = f.open();
        const receipt = await store.create(manifest(), f.expiry());
        const child = await holdInChild(join(f.root, ".publication-uploads", receipt.uploadId, ".commit-lock"));
        child.kill("SIGKILL");
        await child.exited;
        await expect(
            store.commit(receipt.uploadId, async () => ({
                kind: "provider-manifest",
                added: true,
                digest: `sha256:${"0".repeat(64)}`,
                release: {},
            })),
        ).resolves.toMatchObject({ added: true });
    } finally {
        await f.close();
    }
});

test("unexpected lock path replacement is detected and failed acquisitions do not retain resources", async () => {
    const f = await uploadFixture();
    try {
        await expect(
            acquireFilesystemLease(join(f.root, "missing/.lease"), { createParent: false }),
        ).rejects.toMatchObject({ code: "ENOENT" });
        const path = join(f.root, ".lease");
        const lease = await acquireFilesystemLease(path);
        try {
            await rename(path, `${path}.moved`);
            await writeFile(path, "invalid lock data");
            await expect(lease.assertOwnership()).rejects.toThrow("ownership was lost");
            await expect(acquireFilesystemLease(path)).rejects.toThrow();
        } finally {
            await lease.release();
        }
        await rename(`${path}.moved`, path);
        const next = await acquireFilesystemLease(path);
        await next.release();
    } finally {
        await f.close();
    }
});
