import { describe, expect, test } from "bun:test";
import { REPOSITORY_MANAGEMENT_RESPONSE_LIMIT_BYTES } from "../../../src/repositoryManagement/gateway";
import { gateway, jsonResponse, responseBody, TEST_TOKEN, validStatus } from "./fixtures";

describe("HTTP repository management gateway transport", () => {
    test("fails closed on an HTTP redirect", async () => {
        const server = Bun.serve({
            port: 0,
            fetch(request) {
                const url = new URL(request.url);
                if (url.pathname === "/redirected") {
                    return jsonResponse(validStatus());
                }
                return Response.redirect(new URL("/redirected", url), 302);
            },
        });
        try {
            const client = gateway(fetch, { baseUrl: `${server.url.origin}/management` });
            await expectUnavailable(await client.status());
        } finally {
            server.stop(true);
        }
    });

    test("bounds an ignored fetch and a stalled response body with one timeout", async () => {
        let fetchAborted = false;
        const stalledFetch = (async (_input, init) => {
            return await new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener("abort", () => {
                    fetchAborted = true;
                    reject(new DOMException("aborted", "AbortError"));
                });
            });
        }) as typeof fetch;
        const fetchClient = gateway(stalledFetch, { timeoutMs: 20 });
        await expectUnavailable(await fetchClient.status());
        expect(fetchAborted).toBe(true);

        let bodyCancelled = false;
        const stalledBody = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('{"ready":'));
            },
            cancel() {
                bodyCancelled = true;
            },
        });
        const bodyClient = gateway(
            (async () =>
                new Response(stalledBody, {
                    headers: { "content-type": "application/json" },
                })) as typeof fetch,
            { timeoutMs: 20 },
        );
        await expectUnavailable(await bodyClient.status());
        expect(bodyCancelled).toBe(true);
    });

    test("cancels bodies rejected by declared and streamed response limits", async () => {
        let declaredCancelled = false;
        const declaredBody = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(Uint8Array.of(123));
            },
            cancel() {
                declaredCancelled = true;
            },
        });
        const declaredClient = gateway((async () => {
            return new Response(declaredBody, {
                headers: {
                    "content-type": "application/json",
                    "content-length": String(REPOSITORY_MANAGEMENT_RESPONSE_LIMIT_BYTES + 1),
                },
            });
        }) as typeof fetch);
        await expectUnavailable(await declaredClient.status());
        expect(declaredCancelled).toBe(true);

        let streamedCancelled = false;
        const streamedBody = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new Uint8Array(REPOSITORY_MANAGEMENT_RESPONSE_LIMIT_BYTES));
                controller.enqueue(Uint8Array.of(1));
            },
            cancel() {
                streamedCancelled = true;
            },
        });
        const streamedClient = gateway((async () => {
            return new Response(streamedBody, { headers: { "content-type": "application/json" } });
        }) as typeof fetch);
        await expectUnavailable(await streamedClient.status());
        expect(streamedCancelled).toBe(true);
    });

    test("sanitizes authentication, upstream, media-type, and malformed-body failures", async () => {
        const failures = [
            jsonResponse({ error: `bad ${TEST_TOKEN}`, url: "https://repository.internal/private" }, 401),
            jsonResponse({ error: "forbidden" }, 403),
            jsonResponse({ error: "database path /registry/private" }, 500),
            new Response("not json", { status: 200, headers: { "content-type": "text/plain" } }),
            new Response("{", { status: 200, headers: { "content-type": "application/json" } }),
            new Response('{"ready":true,"ready":false}', {
                status: 200,
                headers: { "content-type": "application/json" },
            }),
            new Response(Uint8Array.of(0xef, 0xbb, 0xbf, 0x7b, 0x7d), {
                status: 200,
                headers: { "content-type": "application/json" },
            }),
        ];
        for (const upstream of failures) {
            const client = gateway((async () => upstream.clone()) as typeof fetch);
            const response = await client.status();
            const serialized = JSON.stringify(await responseBody(response.clone()));
            await expectUnavailable(response);
            expect(serialized).not.toContain(TEST_TOKEN);
            expect(serialized).not.toContain("repository.internal");
            expect(serialized).not.toContain("/registry/private");
            expect([...response.headers.keys()].sort()).toEqual(["cache-control", "content-type"]);
        }
    });
});

async function expectUnavailable(response: Response): Promise<void> {
    expect(response.status).toBe(503);
    expect(await responseBody(response)).toEqual({
        code: "repository_management_unavailable",
        error: "Integration repository management is unavailable",
    });
}
