import { describe, expect, test } from "bun:test";
import { InMemoryIdentityService } from "@bernouy/cms-identities";
import { executeFunction, type CmsFunction } from "@bernouy/cms-functions";
import { InMemorySourceRepository, makeEndpointUrn, makeSourceUrn } from "@bernouy/cms-sources";

describe("function identity resolution in forEach", () => {
    test("translates a declared user id from the current item", async () => {
        const sources = new InMemorySourceRepository();
        await sources.createSource({
            urn: makeSourceUrn("commerce"),
            identityAuthority: "commerce",
            endpoints: [
                {
                    urn: makeEndpointUrn("commerce", "listReleases"),
                    method: "GET",
                    targetUrl: "https://commerce.test/releases",
                    output: [
                        {
                            status: "200",
                            body: {
                                type: "object",
                                properties: {
                                    releases: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                            properties: {
                                                sellerId: {
                                                    type: "number",
                                                    semantic: { kind: "user-id", authority: "commerce" },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    ],
                },
            ],
        });
        await sources.createSource({
            urn: makeSourceUrn("stripe-connect"),
            identityAuthority: "stripe-connect",
            endpoints: [
                {
                    urn: makeEndpointUrn("stripe-connect", "configureSeller"),
                    method: "POST",
                    targetUrl: "https://stripe.test/seller",
                    input: {
                        body: {
                            type: "object",
                            properties: {
                                userId: {
                                    type: "string",
                                    semantic: { kind: "user-id", authority: "stripe-connect" },
                                },
                            },
                            required: ["userId"],
                        },
                    },
                    output: [{ status: "200", body: { type: "object" } }],
                },
            ],
        });
        const identities = new InMemoryIdentityService();
        await identities.bind("subject-seller", { authority: "commerce", kind: "user", value: 184 });
        await identities.bind("subject-seller", {
            authority: "stripe-connect",
            kind: "user",
            value: "acct_seller",
        });
        const sellerRequests: Request[] = [];
        const definition: CmsFunction = {
            id: "configureReleaseSellers",
            method: "POST",
            steps: [
                { id: "batch", call: { source: "commerce", endpoint: "listReleases" } },
                {
                    id: "configured",
                    forEach: {
                        items: "$steps.batch.releases",
                        max: 5,
                        steps: [
                            {
                                id: "seller",
                                call: {
                                    source: "stripe-connect",
                                    endpoint: "configureSeller",
                                    body: { userId: "$item.sellerId" },
                                },
                            },
                        ],
                    },
                },
            ],
            return: { body: "$steps.configured" },
        };
        const response = await executeFunction(
            definition,
            new Request("https://cms.test/function", { method: "POST" }),
            {
                sources,
                identities,
                deps: {
                    identities,
                    fetchImpl: async (input, init) => {
                        const request = new Request(input, init);
                        if (request.url.startsWith("https://commerce.test")) {
                            return Response.json({ releases: [{ sellerId: 184 }] });
                        }
                        sellerRequests.push(request);
                        return Response.json({ configured: true });
                    },
                },
            },
        );
        expect(response.status).toBe(200);
        expect(sellerRequests).toHaveLength(1);
        expect(await sellerRequests[0]!.json()).toEqual({ userId: "acct_seller" });
    });
});
