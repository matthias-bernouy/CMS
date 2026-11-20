import { expect, test } from "bun:test";
import { mkdtemp, lstat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startUnixCaptureWorker } from "../../src/unix/server";
import { createUnixCaptureClient } from "../../src/unix/client";
import { fixture, document, options, result } from "./fixture";

test("a second listener cannot replace a live worker, and a client reconnects after clean restart", async () => {
    const f = await fixture();
    try {
        const before = await lstat(f.socket);
        await expect(startUnixCaptureWorker(f.socket, { capture: async () => result() })).rejects.toThrow();
        expect((await lstat(f.socket)).ino).toBe(before.ino);
        const client = createUnixCaptureClient(f.socket);
        expect((await client.capture(document, options)).width).toBe(64);
        await f.server.stop();
        const restarted = await startUnixCaptureWorker(f.socket, { capture: async () => result() });
        try {
            expect((await client.capture(document, options)).width).toBe(64);
        } finally {
            await restarted.stop();
        }
        const external = Bun.serve({ unix: f.socket, fetch: () => new Response("other listener") });
        try {
            await expect(startUnixCaptureWorker(f.socket, { capture: async () => result() })).rejects.toThrow("BUSY");
            expect(await (await fetch("http://capture.local/", { unix: f.socket })).text()).toBe("other listener");
        } finally {
            await external.stop(true);
        }
    } finally {
        await f.close();
    }
});

test("SIGKILL releases the listener lease and only an owned disconnected socket is recovered", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-crashed-worker-"));
    const socket = join(root, "worker.sock");
    const lease = fileURLToPath(new URL("../../src/unix/lease.ts", import.meta.url));
    const child = Bun.spawn(
        [
            process.execPath,
            "-e",
            `
        import { captureSocketLease } from ${JSON.stringify(lease)};
        import { createServer } from "node:net";
        await captureSocketLease(${JSON.stringify(socket)});
        createServer().listen(${JSON.stringify(socket)}, () => console.log("ready"));
    `,
        ],
        { stdout: "pipe", stderr: "pipe" },
    );
    try {
        const reader = child.stdout.getReader();
        const ready = await reader.read();
        reader.releaseLock();
        expect(new TextDecoder().decode(ready.value)).toContain("ready");
        const lock = await lstat(`${socket}.lock`);
        child.kill("SIGKILL");
        await child.exited;
        const worker = await startUnixCaptureWorker(socket, { capture: async () => result() });
        try {
            expect((await createUnixCaptureClient(socket).capture(document, options)).width).toBe(64);
            expect((await lstat(`${socket}.lock`)).ino).toBe(lock.ino);
            expect((await lstat(`${socket}.lock`)).size).toBe(0);
        } finally {
            await worker.stop();
        }
        await Bun.write(socket, "operator-owned file");
        await expect(startUnixCaptureWorker(socket, { capture: async () => result() })).rejects.toThrow("occupied");
        expect(await Bun.file(socket).text()).toBe("operator-owned file");
    } finally {
        child.kill("SIGKILL");
        await child.exited;
        await rm(root, { recursive: true, force: true });
    }
});
