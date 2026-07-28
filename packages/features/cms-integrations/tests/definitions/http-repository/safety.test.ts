import { describe, expect, test } from "bun:test";
import {
    HttpIntegrationDefinitionRepository,
    MAX_INTEGRATION_REPOSITORY_RESPONSE_BYTES,
} from "@bernouy/cms-integrations/http";
import { expectInvalid, expectUnavailable, repository } from "./support";

describe("HttpIntegrationDefinitionRepository transport safety", () => {
    test("keeps the timeout active while streaming a response body and cancels the reader", async () => {
        let canceled = false;
        const repo = repository(
            async () =>
                new Response(
                    new ReadableStream<Uint8Array>({
                        start(controller) {
                            controller.enqueue(new TextEncoder().encode("["));
                        },
                        cancel() {
                            canceled = true;
                        },
                    }),
                    { headers: { "content-type": "application/json" } },
                ),
            5,
        );

        await expectUnavailable(repo.list());
        await Promise.resolve();
        expect(canceled).toBeTrue();
    });

    test("omits credentials, rejects redirects, and keeps requests inside the configured base path", async () => {
        let requestUrl: URL | undefined;
        let requestInit: RequestInit | undefined;
        const repo = new HttpIntegrationDefinitionRepository({
            baseUrl: "https://repo.example.test/catalog",
            fetch: async (input, init) => {
                requestUrl = input instanceof URL ? input : new URL(String(input));
                requestInit = init;
                return Response.json([]);
            },
        });

        expect(await repo.list()).toEqual([]);
        expect(requestUrl?.href).toBe("https://repo.example.test/catalog/api/integrations");
        expect(requestInit?.credentials).toBe("omit");
        expect(requestInit?.redirect).toBe("error");
    });

    test("rejects a response location outside the configured origin or base path", async () => {
        for (const responseUrl of [
            "https://other.example.test/catalog/api/integrations",
            "https://repo.example.test/outside/api/integrations",
            "not a valid URL",
        ]) {
            const repo = new HttpIntegrationDefinitionRepository({
                baseUrl: "https://repo.example.test/catalog",
                fetch: async () => {
                    const response = Response.json([]);
                    Object.defineProperty(response, "url", { value: responseUrl });
                    return response;
                },
            });

            await expectInvalid(repo.list());
        }
    });

    test("rejects oversized declared and chunked JSON bodies as invalid contracts", async () => {
        const declared = repository(
            async () =>
                new Response("[]", {
                    headers: {
                        "content-length": String(MAX_INTEGRATION_REPOSITORY_RESPONSE_BYTES + 1),
                        "content-type": "application/json",
                    },
                }),
        );
        await expectInvalid(declared.list());

        let canceled = false;
        const chunked = repository(
            async () =>
                new Response(
                    new ReadableStream<Uint8Array>({
                        start(controller) {
                            controller.enqueue(new Uint8Array(MAX_INTEGRATION_REPOSITORY_RESPONSE_BYTES));
                            controller.enqueue(new Uint8Array(1));
                        },
                        cancel() {
                            canceled = true;
                        },
                    }),
                    { headers: { "content-type": "application/json" } },
                ),
        );
        await expectInvalid(chunked.list());
        expect(canceled).toBeTrue();
    });

    test("bounds assets by default and rejects false identity content lengths", async () => {
        const declared = repository(
            async () =>
                new Response("asset", {
                    headers: { "content-length": String(MAX_INTEGRATION_REPOSITORY_RESPONSE_BYTES + 1) },
                }),
        );
        await expectInvalid(declared.getAsset("demo", "1.0.0", "asset.bin"));

        let canceled = false;
        const chunked = repository(
            async () =>
                new Response(
                    new ReadableStream<Uint8Array>({
                        start(controller) {
                            controller.enqueue(new Uint8Array(MAX_INTEGRATION_REPOSITORY_RESPONSE_BYTES));
                            controller.enqueue(new Uint8Array(1));
                        },
                        cancel() {
                            canceled = true;
                        },
                    }),
                ),
        );
        await expectInvalid(chunked.getAsset("demo", "1.0.0", "asset.bin"));
        expect(canceled).toBeTrue();

        const wrongLength = repository(
            async () => new Response("asset", { headers: { "content-length": "1", "content-encoding": "identity" } }),
        );
        await expectInvalid(wrongLength.getAsset("demo", "1.0.0", "asset.bin"));
    });
});
