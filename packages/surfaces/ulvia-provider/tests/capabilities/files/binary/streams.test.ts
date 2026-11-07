import { expect, test } from "bun:test";
import type { FilesService } from "@bernouy/cms-files";
import { filesFixture } from "../fixture";

function replaceRead(service: FilesService, read: FilesService["readFile"]): FilesService {
    return new Proxy(service, {
        get(target, key) {
            const value = key === "readFile" ? read : Reflect.get(target, key, target);
            return typeof value === "function" ? value.bind(target) : value;
        },
    });
}

test("Files downloads retain backpressure and release the source on cancellation or abort", async () => {
    let pulls = 0;
    let cancellations = 0;
    const f = await filesFixture({
        service: (service) =>
            replaceRead(service, async () => ({
                ...(await readMetadata(service, stored!)),
                stream: new ReadableStream<Uint8Array>(
                    {
                        pull(controller) {
                            pulls++;
                            controller.enqueue(new Uint8Array(1));
                        },
                        cancel() {
                            cancellations++;
                        },
                    },
                    { highWaterMark: 0 },
                ),
            })),
    });
    let stored: { fileId: string; generation: string } | undefined;
    try {
        stored = await f.upload(await f.invoke("namespace.create", { name: "Assets", defaultVisibility: "public" }));
        for (const mode of ["cancel", "abort"]) {
            const before = pulls;
            const abort = new AbortController();
            const request = f.request("files.read", stored, { signal: abort.signal });
            const response = await f.handle(request);
            expect(response.status).toBe(200);
            await Bun.sleep(0);
            expect(pulls - before).toBeLessThanOrEqual(2);
            const reader = response.body!.getReader();
            expect((await reader.read()).value?.length).toBe(1);
            if (mode === "cancel") {
                await reader.cancel();
            } else {
                abort.abort();
                await reader.read().catch(() => undefined);
            }
            reader.releaseLock();
            await Bun.sleep(0);
        }
        expect(cancellations).toBe(2);
    } finally {
        f.close();
    }
});

test("Files cancels a declared oversized download before consuming its source", async () => {
    let cancelled = 0;
    let pulls = 0;
    const f = await filesFixture({
        service: (service) =>
            replaceRead(service, async () => ({
                ...(await readMetadata(service, stored!)),
                contentLength: 10737418241,
                stream: new ReadableStream<Uint8Array>(
                    {
                        pull() {
                            pulls++;
                        },
                        cancel() {
                            cancelled++;
                        },
                    },
                    { highWaterMark: 0 },
                ),
            })),
    });
    let stored: { fileId: string; generation: string } | undefined;
    try {
        stored = await f.upload(await f.invoke("namespace.create", { name: "Assets", defaultVisibility: "public" }));
        const response = await f.handle(f.request("files.read", stored));
        expect(response.status).toBe(503);
        await Bun.sleep(0);
        expect(cancelled).toBe(1);
        expect(pulls).toBe(0);
    } finally {
        f.close();
    }
});

test("Files cancels a source if its response headers cannot be constructed", async () => {
    let cancelled = 0;
    const f = await filesFixture({
        service: (service) =>
            replaceRead(service, async () => {
                const read = await service.readFile({ fileId: stored!.fileId, generation: stored!.generation });
                await read.stream.cancel();
                return {
                    ...read,
                    file: { ...read.file, name: "\ud800" },
                    stream: new ReadableStream<Uint8Array>(
                        {
                            cancel() {
                                cancelled++;
                            },
                        },
                        { highWaterMark: 0 },
                    ),
                };
            }),
    });
    let stored: { fileId: string; generation: string } | undefined;
    try {
        stored = await f.upload(await f.invoke("namespace.create", { name: "Assets", defaultVisibility: "public" }));
        const response = await f.handle(f.request("files.read", stored));
        expect(response.status).toBe(503);
        expect(cancelled).toBe(1);
    } finally {
        f.close();
    }
});

async function readMetadata(service: FilesService, stored: { fileId: string; generation: string }) {
    const read = await service.readFile(stored);
    await read.stream.cancel();
    return read;
}
