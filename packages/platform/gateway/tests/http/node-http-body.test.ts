import { expect, test } from "bun:test";
import { sendPinnedHttpRequest } from "cms-gateway/invocation/node-http/nodeHttpRequest";
import type { PinnedHttpRequest } from "cms-gateway/invocation/node-http/nodeHttpRequest";

type ReceivedBody = { body: string; bytes: number; length: string | null; encoding: string | null };

async function exchange(
    method: string,
    body?: PinnedHttpRequest["body"],
    headers: Record<string, string> = {},
): Promise<ReceivedBody> {
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(request) {
            const received = await request.text();
            return Response.json({
                body: received,
                bytes: Buffer.byteLength(received),
                length: request.headers.get("content-length"),
                encoding: request.headers.get("transfer-encoding"),
            });
        },
    });
    try {
        const response = await sendPinnedHttpRequest({
            url: new URL("/payload", server.url),
            address: { address: "127.0.0.1", family: 4 },
            method,
            headers,
            ...(body === undefined ? {} : { body }),
            signal: AbortSignal.timeout(5000),
        });
        expect(response.status).toBe(200);
        return (await response.json()) as ReceivedBody;
    } finally {
        server.stop(true);
    }
}

for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    for (const body of ["", JSON.stringify({ value: "UTF-8 é 🔐" })]) {
        test(`pinned ${method} frames ${body ? "Unicode JSON" : "empty text"} by its exact byte length`, async () => {
            const received = await exchange(method, body, { "content-type": "application/json" });
            expect(received.body).toBe(body);
            expect(received.bytes).toBe(Buffer.byteLength(body));
            expect(received.length).toBe(String(Buffer.byteLength(body)));
            expect(received.encoding).toBeNull();
        });
    }
}

for (const method of ["GET", "DELETE"]) {
    test(`pinned ${method} without a body does not add payload framing`, async () => {
        const received = await exchange(method);
        expect(received.body).toBe("");
        expect(received.length).toBeNull();
        expect(received.encoding).toBeNull();
    });
}

for (const method of ["POST", "DELETE"]) {
    for (const knownLength of [false, true]) {
        test(`pinned ${method} streams a payload with ${knownLength ? "known" : "unknown"} length`, async () => {
            const payload = "Streamed é 🔐";
            const bytes = new TextEncoder().encode(payload);
            let offset = 0;
            const body = new ReadableStream<Uint8Array>({
                pull(controller) {
                    if (offset === bytes.length) {
                        controller.close();
                        return;
                    }
                    controller.enqueue(bytes.slice(offset, ++offset));
                },
            });
            const received = await exchange(
                method,
                body,
                knownLength ? { "content-length": String(bytes.length) } : {},
            );
            expect(received.body).toBe(payload);
            expect(received.bytes).toBe(bytes.length);
            expect(received.length).toBe(knownLength ? String(bytes.length) : null);
            expect(received.encoding).toBe(knownLength ? null : "chunked");
            expect(body.locked).toBe(false);
        });
    }
}
