import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireRepositoryOwnership } from "../../src/community/ownership";

test("kernel ownership excludes competitors and ignores stale leases containing a live reused PID", async () => {
    const root = await mkdtemp(join(tmpdir(), "repository-ownership-"));
    try {
        await writeFile(
            join(root, ".server-lock"),
            JSON.stringify({
                schema: "ulvia.filesystem-lease.v1",
                owner: "previous-container",
                pid: process.pid,
                acquiredAt: new Date().toISOString(),
            }),
        );
        const first = await acquireRepositoryOwnership(root);
        try {
            await expect(acquireRepositoryOwnership(root)).rejects.toThrow("already held");
        } finally {
            await first.release();
        }
        const successor = await acquireRepositoryOwnership(root);
        await successor.release();
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("ownership releases when its parent is killed without shutdown handlers", async () => {
    const root = await mkdtemp(join(tmpdir(), "repository-crash-"));
    const module = new URL("../../src/community/ownership.ts", import.meta.url).href;
    const child = Bun.spawn(
        [
            process.execPath,
            "-e",
            `import { acquireRepositoryOwnership } from ${JSON.stringify(module)}; await acquireRepositoryOwnership(process.argv[1]); process.stdout.write("ready"); setInterval(() => {}, 1000);`,
            root,
        ],
        { stdout: "pipe", stderr: "pipe" },
    );
    try {
        const reader = child.stdout.getReader();
        const readiness = await reader.read();
        reader.releaseLock();
        expect(new TextDecoder().decode(readiness.value)).toBe("ready");
        child.kill("SIGKILL");
        await child.exited;
        // The broker notices EOF asynchronously; retry contention for at most two seconds.
        let successor: Awaited<ReturnType<typeof acquireRepositoryOwnership>> | undefined;
        for (let attempt = 0; attempt < 40 && !successor; attempt++) {
            successor = await acquireRepositoryOwnership(root).catch(() => undefined);
            if (!successor) {
                await Bun.sleep(50);
            }
        }
        expect(successor).toBeDefined();
        await successor?.release();
    } finally {
        child.kill();
        await child.exited;
        await rm(root, { recursive: true, force: true });
    }
});
