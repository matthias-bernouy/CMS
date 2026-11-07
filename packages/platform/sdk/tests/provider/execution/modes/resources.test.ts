import { expect, test } from "bun:test";
import { decodeResourceMetadata, RESOURCE_HEADER } from "@bernouy/cms-gateway/protocol";
import { resourceFixture } from "./resourceFixture";

test("SDK native resources preserve representation status, cache dependencies and safe headers without compiler service calls", async () => {
    for (const status of [200, 404]) {
        let reads = 0;
        const runtime = await resourceFixture(
            () => {
                reads++;
                return new Response("data", {
                    status,
                    headers: { "content-type": "text/html", etag: '"revision"', "set-cookie": "private=value" },
                });
            },
            { metadata: { vary: ["accept-language"], cacheTags: ["content:pages"] } },
        );
        expect(reads).toBe(0);
        const response = await runtime.call();
        expect(response.status).toBe(200);
        expect(response.headers.get("set-cookie")).toBeNull();
        expect(decodeResourceMetadata(response.headers.get(RESOURCE_HEADER))).toEqual({
            status,
            headers: { "content-type": "text/html", etag: '"revision"' },
            vary: ["accept-language"],
            cacheTags: ["content:pages"],
        });
        expect(await response.text()).toBe("data");
        expect(reads).toBe(1);
    }
});

test("SDK resources preserve bodyless redirects and revalidation, cancelling discarded bodies", async () => {
    let cancelled = false;
    const source = new ReadableStream<Uint8Array>({
        cancel() {
            cancelled = true;
        },
    });
    const redirect = await resourceFixture(
        () => new Response(source, { status: 301, headers: { location: "/target" } }),
    );
    const response = await redirect.call();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(decodeResourceMetadata(response.headers.get(RESOURCE_HEADER))).toMatchObject({
        status: 301,
        headers: { location: "/target" },
    });
    await Bun.sleep(1);
    expect(cancelled).toBe(true);
    const unchanged = await resourceFixture(() => new Response(null, { status: 304, headers: { etag: '"revision"' } }));
    const notModified = await unchanged.call();
    expect(decodeResourceMetadata(notModified.headers.get(RESOURCE_HEADER))).toMatchObject({ status: 304 });
    expect(await notModified.text()).toBe("");
});

test("SDK resource metadata is refused for ordinary binary outputs and invalid cache dependencies close their source", async () => {
    for (const options of [{ native: false }, { metadata: { cacheTags: ["INVALID tag"] } }]) {
        let cancelled = false;
        const runtime = await resourceFixture(
            () =>
                new Response(
                    new ReadableStream<Uint8Array>({
                        cancel() {
                            cancelled = true;
                        },
                    }),
                    { headers: { "content-type": "text/plain" } },
                ),
            options,
        );
        const response = await runtime.call();
        expect(response.status).toBe(503);
        expect(await response.text()).not.toContain("INVALID tag");
        await Bun.sleep(1);
        expect(cancelled).toBe(true);
    }
});

test("SDK resource bounds cover error representations and cancel oversized declared or streamed bodies", async () => {
    for (const declared of [true, false]) {
        let cancelled = false;
        const runtime = await resourceFixture(
            () =>
                new Response(
                    new ReadableStream<Uint8Array>({
                        pull(controller) {
                            controller.enqueue(new Uint8Array(5));
                        },
                        cancel() {
                            cancelled = true;
                        },
                    }),
                    {
                        status: 404,
                        headers: { "content-type": "text/plain", ...(declared ? { "content-length": "5" } : {}) },
                    },
                ),
        );
        const response = await runtime.call();
        if (declared) {
            expect(response.status).toBe(503);
        } else {
            expect(response.status).toBe(200);
            await expect(response.arrayBuffer()).rejects.toThrow("byte bound");
        }
        await Bun.sleep(1);
        expect(cancelled).toBe(true);
    }
});

test("SDK resource streams retain backpressure and release the source when the consumer cancels or its request aborts", async () => {
    for (const abort of [false, true]) {
        let cancelled = false;
        let pulls = 0;
        const controller = new AbortController();
        const runtime = await resourceFixture(
            () =>
                new Response(
                    new ReadableStream<Uint8Array>({
                        pull(stream) {
                            pulls++;
                            stream.enqueue(new Uint8Array(1));
                        },
                        cancel() {
                            cancelled = true;
                        },
                    }),
                    { headers: { "content-type": "text/plain" } },
                ),
        );
        const response = await runtime.call({ signal: controller.signal });
        await Bun.sleep(1);
        expect(pulls).toBeLessThanOrEqual(2);
        if (abort) {
            controller.abort();
        } else {
            await response.body!.cancel();
        }
        await Bun.sleep(1);
        expect(cancelled).toBe(true);
        expect(pulls).toBeLessThanOrEqual(2);
    }
});

test("SDK resource limits release reader locks on completion and abort a pending source read", async () => {
    const complete = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(new Uint8Array(4));
            controller.close();
        },
    });
    const runtime = await resourceFixture(() => new Response(complete, { headers: { "content-type": "text/plain" } }));
    expect(await (await runtime.call()).arrayBuffer()).toHaveLength(4);
    expect(complete.locked).toBe(false);
    let cancelled = false;
    const pending = new ReadableStream<Uint8Array>({
        pull() {
            return new Promise<void>(() => undefined);
        },
        cancel() {
            cancelled = true;
        },
    });
    const waiting = await resourceFixture(() => new Response(pending, { headers: { "content-type": "text/plain" } }));
    const abort = new AbortController();
    const response = await waiting.call({ signal: abort.signal });
    const read = response.arrayBuffer();
    abort.abort(new Error("Request abandoned"));
    await expect(read).rejects.toThrow("Request abandoned");
    await Bun.sleep(1);
    expect(cancelled).toBe(true);
    expect(pending.locked).toBe(false);
});
