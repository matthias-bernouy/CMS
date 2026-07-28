import { afterEach, describe, expect, test } from "bun:test";
import { readBoundedJsonObjectResponse } from "../../../src/http/readBoundedJsonObjectResponse";
import { publishIntegrationCandidate } from "../../../src/repositoryPublication/candidate/client";
import {
    CANDIDATE,
    candidateClientConfig,
    candidateJson,
    candidateServerOrigin,
    serveCandidateClient,
    stopCandidateClientServers,
} from "./fixtures";

afterEach(stopCandidateClientServers);

const MAX_RESPONSE_BYTES = 1_048_576;

describe("repository candidate HTTP safety", () => {
    test("bounds responses, enforces JSON, times out, and refuses redirects", async () => {
        const oversized = serveCandidateClient(
            () => new Response("x".repeat(1_048_577), { headers: { "content-type": "application/json" } }),
        );
        expect(await publishIntegrationCandidate(candidateClientConfig(oversized), CANDIDATE)).toEqual({
            outcome: "failed",
            reason: "invalid-response",
            status: 200,
        });
        const wrongType = serveCandidateClient(() => new Response("{}", { headers: { "content-type": "text/plain" } }));
        expect(await publishIntegrationCandidate(candidateClientConfig(wrongType), CANDIDATE)).toEqual({
            outcome: "failed",
            reason: "invalid-response",
            status: 200,
        });
        const delayed = serveCandidateClient(async () => {
            await Bun.sleep(50);
            return candidateJson(404, {});
        });
        expect(
            await publishIntegrationCandidate({ ...candidateClientConfig(delayed), timeoutMs: 5 }, CANDIDATE),
        ).toEqual({ outcome: "failed", reason: "timeout" });

        let targetCalls = 0;
        const target = serveCandidateClient(() => {
            targetCalls += 1;
            return candidateJson(200, {});
        });
        const redirect = serveCandidateClient(() => Response.redirect(`${candidateServerOrigin(target)}/capture`, 302));
        expect(await publishIntegrationCandidate(candidateClientConfig(redirect), CANDIDATE)).toEqual({
            outcome: "failed",
            reason: "transport",
        });
        expect(targetCalls).toBe(0);
    });
});

describe("bounded repository JSON responses", () => {
    test("accepts a JSON object at the byte limit", async () => {
        const wrapperBytes = new TextEncoder().encode('{"padding":""}').byteLength;
        const paddingLength = MAX_RESPONSE_BYTES - wrapperBytes;
        const response = new Response(`{"padding":"${"x".repeat(paddingLength)}"}`, {
            headers: { "content-type": "APPLICATION/JSON; CHARSET=UTF-8" },
        });

        const body = await readBoundedJsonObjectResponse(response, "management");

        expect(typeof body.padding).toBe("string");
        expect((body.padding as string).length).toBe(paddingLength);
    });

    test("cancels responses rejected from their headers", async () => {
        for (const [kind, headers, message] of [
            [
                "management",
                { "content-type": "text/plain" },
                "Repository management response must use application/json",
            ],
            [
                "maintenance",
                { "content-type": "application/json", "content-length": String(MAX_RESPONSE_BYTES + 1) },
                "Repository maintenance response exceeds its byte limit",
            ],
            [
                "maintenance",
                { "content-type": "application/json", "content-length": "1e3" },
                "Repository maintenance response exceeds its byte limit",
            ],
        ] as const) {
            let cancelled = false;
            const response = new Response(
                new ReadableStream<Uint8Array>({
                    start(controller) {
                        controller.enqueue(Uint8Array.of(123));
                    },
                    cancel() {
                        cancelled = true;
                    },
                }),
                { headers },
            );

            await expect(readBoundedJsonObjectResponse(response, kind)).rejects.toThrow(message);
            expect(cancelled).toBe(true);
        }
    });

    test("cancels a streamed response after it crosses the byte limit", async () => {
        let cancelled = false;
        const response = new Response(
            new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new Uint8Array(MAX_RESPONSE_BYTES));
                    controller.enqueue(Uint8Array.of(1));
                },
                cancel() {
                    cancelled = true;
                },
            }),
            { headers: { "content-type": "application/json" } },
        );

        await expect(readBoundedJsonObjectResponse(response, "management")).rejects.toThrow(
            "Repository management response exceeds its byte limit",
        );
        expect(cancelled).toBe(true);
    });

    test("requires a body containing a JSON object", async () => {
        const headers = { "content-type": "application/json" };
        await expect(readBoundedJsonObjectResponse(new Response(null, { headers }), "maintenance")).rejects.toThrow(
            "Repository maintenance response body is missing",
        );
        await expect(readBoundedJsonObjectResponse(new Response("[]", { headers }), "management")).rejects.toThrow(
            "Repository management response must be a JSON object",
        );
    });
});
