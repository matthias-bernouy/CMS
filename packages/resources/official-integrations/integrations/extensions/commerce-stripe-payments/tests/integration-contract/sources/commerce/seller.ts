import { makeEndpointUrn, type Source } from "@bernouy/cms-sources";

export function commerceSellerEndpoints(): Source["endpoints"] {
    return [
        {
            urn: makeEndpointUrn("commerce", "mySeller"),
            method: "GET",
            targetUrl: "https://commerce.test/seller",
            headers: [{ name: "x-cms-user-id", source: { from: "computed", ref: "userID" } }],
            input: { params: [] },
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            exists: { type: "boolean" },
                            id: { type: "number" },
                            cmsUserId: { type: "string" },
                            verificationStatus: { type: "string" },
                            version: { type: "number" },
                        },
                    },
                },
            ],
        },
        {
            urn: makeEndpointUrn("commerce", "getCurrentSellerIdentity"),
            method: "GET",
            access: { mode: "system" },
            targetUrl: "https://commerce.test/seller",
            headers: [
                {
                    name: "authorization",
                    source: {
                        from: "secret",
                        ref: "{{secrets.cmsApiKey}}",
                        prefix: "Bearer ",
                    },
                },
                {
                    name: "x-cms-user-id",
                    source: { from: "computed", ref: "userID" },
                },
            ],
            effects: {
                identityBindings: [{ kind: "user", responsePath: "id" }],
            },
            input: { params: [] },
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            exists: { type: "boolean" },
                            id: {
                                type: "number",
                                semantic: { kind: "user-id", authority: "commerce" },
                            },
                            cmsUserId: { type: "string" },
                        },
                    },
                },
            ],
        },
        {
            urn: makeEndpointUrn("commerce", "reviewSeller"),
            method: "POST",
            targetUrl: "https://commerce.test/seller/review",
            input: {
                params: [{ name: "id", in: "query", schema: { type: "string" } }],
                body: {
                    type: "object",
                    properties: {
                        status: { type: "string" },
                        reason: { type: "string" },
                        expectedVersion: { type: "number" },
                    },
                    required: ["status", "expectedVersion"],
                },
            },
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            id: { type: "number" },
                            verificationStatus: { type: "string" },
                            version: { type: "number" },
                        },
                    },
                },
            ],
        },
        {
            urn: makeEndpointUrn("commerce", "submitMyOfferPrice"),
            method: "POST",
            targetUrl: "https://commerce.test/offer/price",
            input: {
                params: [{ name: "id", in: "query", schema: { type: "string" } }],
                body: {
                    type: "object",
                    properties: { amount: { type: "number" }, expectedVersion: { type: "number" } },
                    required: ["amount", "expectedVersion"],
                },
            },
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: { offer: { type: "object" }, proposal: { type: "object" } },
                    },
                },
            ],
        },
    ];
}
