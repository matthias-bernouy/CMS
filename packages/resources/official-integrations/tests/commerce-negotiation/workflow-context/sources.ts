import {
    InMemorySourceRepository,
    makeEndpointUrn,
    makeSourceUrn,
    type Source,
    type SourceEndpoint,
} from "@bernouy/cms-sources";

const openObject = { type: "object" } as const;

export async function workflowSources(): Promise<InMemorySourceRepository> {
    const sources = new InMemorySourceRepository();
    await sources.createSource(
        source("commerce", [
            get("manageOffer", "https://commerce.test/admin/offer", ["id"]),
            get("seller", "https://commerce.test/admin/seller", ["id"]),
            get("getOfferNegotiationContext", "https://commerce.test/system/offer/negotiation-context", ["offerId"], {
                mode: "system",
            }),
        ]),
    );
    await sources.createSource(
        source("commerce-negotiation", [
            {
                ...get(
                    "getProposalPolicy",
                    "https://negotiation.test/policy",
                    [
                        "offerId",
                        "offerSlug",
                        "offerTitle",
                        "sellerCmsUserId",
                        "sellerDisplayName",
                        "referenceAmount",
                        "currency",
                        "publicationStatus",
                        "availability",
                    ],
                    { mode: "system" },
                ),
                headers: [userHeader],
            },
            {
                urn: makeEndpointUrn("commerce-negotiation", "createMyProposal"),
                method: "POST",
                access: { mode: "system" },
                targetUrl: "https://negotiation.test/proposals",
                headers: [userHeader],
                input: {
                    body: {
                        type: "object",
                        properties: Object.fromEntries(
                            [
                                "offerId",
                                "amount",
                                "message",
                                "offerSlug",
                                "offerTitle",
                                "sellerCmsUserId",
                                "sellerDisplayName",
                                "referenceAmount",
                                "currency",
                                "publicationStatus",
                                "availability",
                            ].map((name) => [
                                name,
                                {
                                    type: ["offerId", "amount", "referenceAmount"].includes(name)
                                        ? ("number" as const)
                                        : ("string" as const),
                                },
                            ]),
                        ),
                        required: [
                            "offerId",
                            "amount",
                            "offerSlug",
                            "offerTitle",
                            "sellerCmsUserId",
                            "referenceAmount",
                            "currency",
                            "publicationStatus",
                            "availability",
                        ],
                    },
                },
                output: [{ status: "201", body: openObject }],
            },
        ]),
    );
    return sources;
}

function source(id: string, endpoints: SourceEndpoint[]): Source {
    return {
        urn: makeSourceUrn(id),
        meta: { name: id },
        endpoints,
    };
}

function get(id: string, targetUrl: string, params: string[], access?: SourceEndpoint["access"]): SourceEndpoint {
    return {
        urn: makeEndpointUrn(targetUrl.includes("negotiation.test") ? "commerce-negotiation" : "commerce", id),
        method: "GET",
        access,
        targetUrl,
        input: {
            params: params.map((name) => ({
                name,
                in: "query",
                required: name !== "sellerDisplayName",
                schema: {
                    type: ["offerId", "referenceAmount"].includes(name) ? "number" : "string",
                },
            })),
        },
        output: [{ status: "200", body: openObject }],
    };
}

const userHeader = {
    name: "x-cms-user-id",
    source: { from: "computed", ref: "userID" },
} as const;
