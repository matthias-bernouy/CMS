import { expect, test } from "bun:test";
import { Readable } from "node:stream";
import { collectZipStream } from "../src/core/streams";

test("destroys the active borrowed stream immediately on a byte refusal", async () => {
    const stream = Readable.from([Buffer.alloc(12), Buffer.alloc(12)]);
    await expect(collectZipStream(stream, 16)).rejects.toMatchObject({ code: "limit_exceeded" });
    expect(stream.destroyed).toBe(true);
});

test("cancellation destroys a pending stream and rejects the read", async () => {
    const stream = new Readable({ read() {} });
    const controller = new AbortController();
    const pending = collectZipStream(stream, 16, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(stream.destroyed).toBe(true);
});
