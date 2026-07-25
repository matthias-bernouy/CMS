import { makeEndpointUrn, type Source } from "@bernouy/cms-sources";

export function commerceBuyerLegalEndpoints(): Source["endpoints"] {
    return [
        {
            urn: makeEndpointUrn("commerce", "getBuyerLegalRequirements"),
            method: "GET",
            access: { mode: "system" },
            targetUrl: "https://commerce.test/buyer-legal/requirements",
            headers: [{ name: "x-cms-user-id", source: { from: "computed", ref: "userID" } }],
            input: {
                params: [
                    { name: "orderId", in: "query", schema: { type: "number" }, required: true },
                    { name: "paymentProvider", in: "query", schema: { type: "string" }, required: true },
                ],
            },
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            enabled: { type: "boolean" },
                            documents: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        key: { type: "string" },
                                        label: { type: "string" },
                                        consentText: { type: "string" },
                                        pageUrl: { type: "string" },
                                        versionId: { type: "string" },
                                        versionDate: { type: "string" },
                                    },
                                    required: ["key", "label", "consentText", "pageUrl", "versionId", "versionDate"],
                                },
                            },
                        },
                        required: ["enabled", "documents"],
                    },
                },
                {
                    status: "409",
                    body: {
                        type: "object",
                        properties: { error: { type: "string" } },
                        required: ["error"],
                    },
                },
            ],
        },
    ];
}
