import { describe, expect, mock, test } from "bun:test";
import { executeEndpoint } from "cms-sources/core/executeEndpoint";
import { triggerResponseProjection } from "cms-sources/core/response-projection/triggerResponseBody";
import { ep } from "../helpers/executeEndpointFixtures";

describe("executeEndpoint trigger response projection", () => {
    test("keeps the private projection on the response returned by the executor", async () => {
        const response = await executeEndpoint(ep({
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
        }), new Request("http://local.test/source"), {
            fetchImpl: mock(async () => Response.json({
                id: "public-id",
                authorization: { token: "internal-token", ignored: true },
            })),
        });

        expect(await response.clone().json()).toEqual({ id: "public-id" });
        expect(triggerResponseProjection(response)?.body).toEqual({
            id: "public-id",
            authorization: { token: "internal-token" },
        });
    });
});
