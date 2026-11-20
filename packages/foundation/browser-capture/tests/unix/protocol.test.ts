import { expect, test } from "bun:test";
import { lstat, chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUnixCaptureClient } from "../../src/unix/client";
import { startUnixCaptureWorker } from "../../src/unix/server";
import { encodeDocument, decodeResult } from "../../src/unix/protocol";
import { readJson } from "../../src/unix/body";
import { fixture, document, options, result } from "./fixture";

test("private Unix capture transports exact document bytes and returns validated pixels", async () => {
    let seen = "";
    const f = await fixture({
        capture: async (document) => {
            seen = await document.files.get(document.path)!.text();
            return result();
        },
    });
    try {
        const image = await createUnixCaptureClient(f.socket).capture(document, options);
        expect(image.bytes).toEqual(result().bytes);
        expect(seen).toBe("private");
        expect((await lstat(f.socket)).mode & 0o777).toBe(0o660);
    } finally {
        await f.close();
    }
    await expect(createUnixCaptureClient(f.socket).capture(document, options)).rejects.toThrow("UNAVAILABLE");
    await expect(createUnixCaptureClient().capture(document, options)).rejects.toThrow("UNAVAILABLE");
});

test("invalid jobs and browser-origin requests refuse before worker execution", async () => {
    let calls = 0;
    const f = await fixture({
        capture: async () => {
            calls++;
            return result();
        },
    });
    try {
        const job = await encodeDocument(document, options);
        for (const invalid of [
            { ...job, executablePath: "/bin/sh" },
            { ...job, files: [...job.files, ...job.files] },
            { ...job, files: [{ ...job.files[0], base64: "not base64" }] },
            { ...job, files: [{ ...job.files[0], path: "../private" }] },
            { ...job, options: { ...options, mode: "element", selector: {} } },
            { ...job, options: { ...options, width: 99999 } },
        ]) {
            const response = await f.request(invalid);
            expect(response.status).toBe(400);
            await response.body?.cancel();
        }
        const browser = await f.request(job, { origin: "https://outside.test" });
        expect(browser.status).toBe(403);
        expect(calls).toBe(0);
    } finally {
        await f.close();
    }
});

test("world-accessible socket directories and oversized or corrupt representations refuse", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-unsafe-socket-"));
    try {
        await chmod(root, 0o777);
        await expect(
            startUnixCaptureWorker(join(root, "worker.sock"), { capture: async () => result() }),
        ).rejects.toThrow("inaccessible");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
    await expect(readJson(new Response("12345").body, 4)).rejects.toThrow("LIMIT_EXCEEDED");
    expect(() => decodeResult({ ...result(), base64: Buffer.alloc(24).toString("base64") })).toThrow();
    expect(() =>
        decodeResult({ ...result(), base64: Buffer.from(result().bytes).toString("base64"), width: 65 }),
    ).toThrow();
});
