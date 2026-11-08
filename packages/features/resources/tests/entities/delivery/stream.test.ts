import { expect, test } from "bun:test";
import { resourceAssetStream } from "../../../src/integration/delivery/stream";

test("asset delivery honors consumer backpressure, cancellation and request abort while a read is pending", async () => {
    let pulls = 0;
    let cancellations = 0;
    const source = new ReadableStream<Uint8Array>(
        {
            pull(output) {
                pulls++;
                output.enqueue(new Uint8Array([1]));
            },
            cancel() {
                cancellations++;
            },
        },
        { highWaterMark: 0 },
    );
    const response = resourceAssetStream(source, 3, new AbortController().signal);
    await Promise.resolve();
    expect(pulls).toBe(0);
    const reader = response.getReader();
    expect((await reader.read()).value).toEqual(new Uint8Array([1]));
    await Promise.resolve();
    expect(pulls).toBe(1);
    await reader.cancel();
    reader.releaseLock();
    expect(cancellations).toBe(1);
    expect(source.locked).toBe(false);

    const controller = new AbortController();
    const pendingSource = new ReadableStream<Uint8Array>({
        cancel() {
            cancellations++;
        },
    });
    const pending = resourceAssetStream(pendingSource, 1, controller.signal).getReader();
    const read = pending.read();
    controller.abort(new Error("request cancelled"));
    await expect(read).rejects.toThrow("request cancelled");
    await Promise.resolve();
    expect(pendingSource.locked).toBe(false);
    expect(cancellations).toBe(2);
    pending.releaseLock();
});
test("observed asset sizes reject truncated and oversized storage bodies and release their readers", async () => {
    for (const bytes of [new Uint8Array([1]), new Uint8Array([1, 2, 3])]) {
        const source = new Response(bytes).body!;
        const response = new Response(resourceAssetStream(source, 2, new AbortController().signal));
        await expect(response.arrayBuffer()).rejects.toThrow("declared length");
        expect(source.locked).toBe(false);
    }
});
