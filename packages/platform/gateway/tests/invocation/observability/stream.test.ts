import { expect, test } from "bun:test";
import { observeStream } from "cms-gateway/invocation/observability/observeStream";

test("observes consumed bytes and EOF exactly once", async () => {
    const events: unknown[] = [];
    const source = new ReadableStream<Uint8Array>({
        start(c) {
            c.enqueue(new Uint8Array([1, 2, 3]));
            c.close();
        },
    });
    const stream = observeStream(source, (...args) => events.push(args));
    expect(new Uint8Array(await new Response(stream).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(events).toEqual([["completed", 3]]);
    expect(source.locked).toBe(false);
});

test("cancel during a pending read retains the cancellation outcome", async () => {
    const events: unknown[] = [];
    let cancelled: unknown;
    const source = new ReadableStream<Uint8Array>({
        cancel(reason) {
            cancelled = reason;
        },
    });
    const reader = observeStream(source, (...args) => events.push(args)).getReader();
    const pending = reader.read();
    await Promise.resolve();
    await reader.cancel("client disconnected");
    await pending;
    expect(events).toEqual([["cancelled", 0]]);
    expect(cancelled).toBe("client disconnected");
    expect(source.locked).toBe(false);
});

test("stream failure emits a terminal outcome without payload or error detail", async () => {
    const events: unknown[] = [];
    const source = new ReadableStream<Uint8Array>({
        pull(c) {
            c.error(new Error("secret"));
        },
    });
    await expect(new Response(observeStream(source, (...args) => events.push(args))).arrayBuffer()).rejects.toThrow(
        "secret",
    );
    expect(events).toEqual([["stream-error", 0]]);
    expect(source.locked).toBe(false);
});
