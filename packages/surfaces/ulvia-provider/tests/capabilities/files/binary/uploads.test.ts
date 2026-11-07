import { expect, test } from "bun:test";
import { filesFixture } from "../fixture";

test("Files rejects oversized and incomplete uploads without committing a generation", async () => {
    const f = await filesFixture({ maxFileBytes: 4 });
    try {
        const ns = await f.invoke("namespace.create", { name: "Bounded", defaultVisibility: "private" });
        const keys = { namespaceId: ns.namespaceId, namespaceKey: ns.namespaceKey };
        const initial = { ...f.counts };
        const tooLarge = await f.call("upload.create", { ...keys, filename: "a", size: 5 });
        expect(tooLarge.status).toBe(422);
        expect(f.counts.mutations).toBe(initial.mutations);
        for (const text of ["five!", "ab"]) {
            const session = await f.invoke("upload.create", { ...keys, filename: "a", size: 4 });
            const response = await f.call("upload.write", session, { bytes: text });
            expect(response.status).toBe(409);
            expect((await f.store.getUpload(session.uploadId))?.state).toBe("pending");
            expect(await f.blobs.exists(`uploads/${session.uploadId}`)).toBe(false);
            expect((await f.call("upload.complete", { ...keys, uploadId: session.uploadId })).status).toBe(409);
        }
        const session = await f.invoke("upload.create", { ...keys, filename: "a", size: 4 });
        const before = { ...f.counts };
        const response = await f.call(
            "upload.write",
            { uploadId: session.uploadId, uploadToken: "upl_invalid-" + "x".repeat(40) },
            { bytes: "good" },
        );
        expect(response.status).toBe(403);
        expect(f.counts.mutations).toBe(before.mutations);
        expect(f.counts.blobWrites).toBe(before.blobWrites);
        expect((await f.invoke("files.list", keys)).items).toEqual([]);
    } finally {
        f.close();
    }
});

test("an aborted Files upload cancels its source and leaves no committed generation", async () => {
    const f = await filesFixture();
    try {
        const ns = await f.invoke("namespace.create", { name: "Assets", defaultVisibility: "private" });
        const keys = { namespaceId: ns.namespaceId, namespaceKey: ns.namespaceKey };
        const session = await f.invoke("upload.create", { ...keys, filename: "a", size: 4 });
        let ready!: () => void;
        const started = new Promise<void>((resolve) => {
            ready = resolve;
        });
        let sent = false;
        let cancelled = 0;
        const stream = new ReadableStream<Uint8Array>(
            {
                pull(controller) {
                    if (!sent) {
                        sent = true;
                        controller.enqueue(new Uint8Array([1, 2]));
                        ready();
                    }
                },
                cancel() {
                    cancelled++;
                },
            },
            { highWaterMark: 0 },
        );
        const abort = new AbortController();
        const pending = f.handle(f.request("upload.write", session, { bytes: stream, signal: abort.signal }));
        await started;
        abort.abort();
        const response = await pending;
        expect(response.status).toBe(503);
        await response.body?.cancel();
        await Bun.sleep(0);
        expect(cancelled).toBe(1);
        expect((await f.store.getUpload(session.uploadId))?.state).toBe("pending");
        expect(await f.blobs.exists(`uploads/${session.uploadId}`)).toBe(false);
        expect((await f.invoke("files.list", keys)).items).toEqual([]);
    } finally {
        f.close();
    }
});
