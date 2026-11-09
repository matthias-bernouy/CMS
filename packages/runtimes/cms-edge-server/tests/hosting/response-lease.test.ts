import { expect, test } from "bun:test";
import { retainResponseResource } from "@bernouy/http-runner";

test("a response retains its context through all stream chunks", async () => {
    let released = 0;
    const tail = Promise.withResolvers<void>();
    const response = retainResponseResource(
        new Response(
            new ReadableStream({
                async start(controller) {
                    controller.enqueue(new TextEncoder().encode("first"));
                    await tail.promise;
                    controller.enqueue(new TextEncoder().encode("second"));
                    controller.close();
                },
            }),
        ),
        () => {
            released++;
        },
    );
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("first");
    expect(released).toBe(0);
    tail.resolve();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("second");
    expect((await reader.read()).done).toBe(true);
    expect(released).toBe(1);
});

test("cancellation forwards to the source and releases exactly once", async () => {
    let released = 0;
    let cancelled = false;
    const response = retainResponseResource(
        new Response(
            new ReadableStream({
                cancel() {
                    cancelled = true;
                },
            }),
        ),
        () => {
            released++;
        },
    );
    await response.body!.cancel();
    expect(cancelled).toBe(true);
    expect(released).toBe(1);
});

test("request abortion cancels a pending read and releases the context", async () => {
    const abort = new AbortController();
    let released = 0;
    const response = retainResponseResource(
        new Response(new ReadableStream()),
        () => {
            released++;
        },
        abort.signal,
    );
    const read = response.body!.getReader().read();
    abort.abort(new Error("disconnected"));
    await expect(read).rejects.toThrow("disconnected");
    await Promise.resolve();
    await Promise.resolve();
    expect(released).toBe(1);
});

test("stream failure and bodyless responses release their contexts", async () => {
    let released = 0;
    const response = retainResponseResource(
        new Response(
            new ReadableStream({
                pull(controller) {
                    controller.error(new Error("source failed"));
                },
            }),
        ),
        () => {
            released++;
        },
    );
    await expect(response.text()).rejects.toThrow("source failed");
    expect(released).toBe(1);
    expect(
        retainResponseResource(new Response(null, { status: 204 }), () => {
            released++;
        }).status,
    ).toBe(204);
    expect(released).toBe(2);
});
