import {
    makeEndpointUrn,
    type DataShape,
    type SourceEndpoint,
} from "@bernouy/cms-sources";
import {
    computedHeader,
    number,
    object,
    openObject,
    text,
} from "./shapes";

export function commerceEndpoints(): SourceEndpoint[] {
    return [mySeller(), currentSellerIdentity(), submitPrice()];
}

function mySeller(): SourceEndpoint {
    return {
        urn: makeEndpointUrn("commerce", "mySeller"),
        method: "GET",
        access: { mode: "auth" },
        targetUrl: "https://commerce.test/seller",
        headers: [computedHeader("x-cms-user-id")],
        effects: {
            identityBindings: [{ kind: "user", responsePath: "id" }],
        },
        input: { params: [] },
        output: [{ status: "200", body: object({
            exists: { type: "boolean" },
            id: {
                type: "number",
                semantic: { kind: "user-id", authority: "commerce" },
            },
            kind: text(),
            cmsUserId: text(),
            slug: text(),
            displayName: text(),
            verificationStatus: text(),
            verifiedAt: text(true),
            verifiedBy: text(),
            metadata: openObject,
            version: number(),
            createdAt: text(),
            updatedAt: text(),
        }) }],
    };
}

function currentSellerIdentity(): SourceEndpoint {
    return {
        urn: makeEndpointUrn("commerce", "getCurrentSellerIdentity"),
        method: "GET",
        access: { mode: "system" },
        targetUrl: "https://commerce.test/seller",
        headers: [{
            name: "authorization",
            source: {
                from: "secret",
                ref: "{{secrets.cmsApiKey}}",
                prefix: "Bearer ",
            },
        }, computedHeader("x-cms-user-id")],
        effects: {
            identityBindings: [{ kind: "user", responsePath: "id" }],
        },
        input: { params: [] },
        output: [{ status: "200", body: object({
            exists: { type: "boolean" },
            id: {
                type: "number",
                semantic: { kind: "user-id", authority: "commerce" },
            },
            cmsUserId: text(),
        }) }],
    };
}

function submitPrice(): SourceEndpoint {
    return {
        urn: makeEndpointUrn("commerce", "submitMyOfferPrice"),
        method: "POST",
        access: { mode: "auth" },
        targetUrl: "https://commerce.test/offer/price",
        headers: [computedHeader("x-cms-user-id")],
        input: {
            params: [{
                name: "id",
                in: "query",
                required: true,
                schema: text(),
            }],
            body: object({
                amount: number(),
                expectedVersion: number(),
            }, ["amount", "expectedVersion"]),
        },
        output: [{ status: "200", body: object({
            offer: offerShape(),
            proposal: proposalShape(),
        }) }],
    };
}

function offerShape(): DataShape {
    return object({
        id: number(),
        sellerId: number(),
        productId: number(),
        variantId: number(true),
        slug: text(),
        title: text(),
        description: text(true),
        conditionCode: text(),
        publicationStatus: text(),
        workflowState: text(),
        acceptedPriceAmount: number(true),
        currency: text(),
        availability: text(),
        quantityAvailable: number(true),
        inventoryRevision: number(),
        metadata: openObject,
        version: number(),
        createdAt: text(),
        updatedAt: text(),
    });
}

function proposalShape(): DataShape {
    return object({
        id: number(),
        offerId: number(),
        amount: number(),
        currency: text(),
        status: text(),
        proposedBy: text(),
        decidedBy: text(true),
        decisionReason: text(true),
        decidedAt: text(true),
        createdAt: text(),
    });
}
