import { describe, expect, test } from "bun:test";
import {
    projectEndpointResponse,
    type ResponseProjectionEvent,
} from "cms-sources/core/response-projection/projectEndpointResponse";
import { triggerResponseProjection } from "cms-sources/core/response-projection/triggerResponseBody";
import type { SourceEndpoint } from "cms-sources/interfaces/Source";

const endpoint: SourceEndpoint = {
    urn: "urn:test:private-response",
    method: "POST",
    targetUrl: "https://api.example.test/command",
    output: [{
        status: "200",
        body: {
            type: "object",
            properties: { id: { type: "string" } },
            required: ["id"],
        },
        triggerBody: {
            type: "object",
            properties: {
                authorization: {
                    type: "object",
                    properties: { token: { type: "string" } },
                    required: ["token"],
                },
            },
            required: ["authorization"],
        },
    }],
};

describe("trigger response body projection", () => {
    test("merges strict trigger fields in-process without exposing them or copying them to clones", async () => {
        const response = await projectEndpointResponse(
            endpoint,
            new Request("http://local.test/source", { method: "POST" }),
            jsonResponse({ id: "public-id", authorization: { token: "internal-token", extra: true } }),
        );

        expect(await response.clone().json()).toEqual({ id: "public-id" });
        expect(triggerResponseProjection(response)?.body).toEqual({
            id: "public-id",
            authorization: { token: "internal-token" },
        });
        expect(triggerResponseProjection(response.clone())).toBeUndefined();
    });

    test("fails closed with a generic response when required trigger fields are missing", async () => {
        let event: ResponseProjectionEvent | undefined;
        const response = await projectEndpointResponse(
            endpoint,
            new Request("http://local.test/source", { method: "POST" }),
            jsonResponse({ id: "public-id", authorization: {} }),
            { reportResponseProjectionEvent: reported => { event = reported; } },
        );

        expect(response.status).toBe(502);
        expect(await response.text()).not.toContain("public-id");
        expect(event).toMatchObject({
            kind: "response_projection_failure",
            reason: "type_mismatch",
            path: "$trigger",
        });
        expect(triggerResponseProjection(response)).toBeUndefined();
    });

    test("fails closed when a direct caller bypasses validation with an opaque trigger array", async () => {
        const response = await projectEndpointResponse(
            {
                ...endpoint,
                output: [{
                    ...endpoint.output![0]!,
                    triggerBody: {
                        type: "object",
                        properties: { unsafe: { type: "array" } },
                    },
                }],
            },
            new Request("http://local.test/source", { method: "POST" }),
            jsonResponse({ id: "public-id", unsafe: [{ secret: "unbounded" }] }),
        );

        expect(response.status).toBe(502);
        expect(await response.text()).not.toContain("unbounded");
        expect(triggerResponseProjection(response)).toBeUndefined();
    });
});

function jsonResponse(value: unknown): Response {
    return Response.json(value);
}
