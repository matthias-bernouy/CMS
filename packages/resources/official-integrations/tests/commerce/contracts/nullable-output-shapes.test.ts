import { describe, expect, test } from "bun:test";
import { projectStrictDataShape, type DataShape } from "@bernouy/cms-sources";
import { resolve } from "node:path";
import { loadIntegrationDefinition } from "../../helpers/integrationDefinition";

type Endpoint = { endpointId: string; output?: Array<{ status?: string; body?: DataShape; triggerBody?: DataShape }> };
type Definition = { artifacts: Array<{ source?: { endpoints: Endpoint[] } }> };

const definitionPath = resolve(
    import.meta.dir,
    "../../../integrations/domains/commerce/versions/1.0.0/definition.json",
);
describe("commerce nullable response contracts", () => {
    test("preserves catalogue nulls across public and management projections", async () => {
        const endpoints = await commerceEndpoints();
        const cases: Array<[string, unknown]> = [
            ["products", { items: [{ description: null }] }],
            [
                "product",
                {
                    description: null,
                    media: [{ media: { alt: null } }],
                    mainImageMediaId: null,
                    variants: [{ sku: null }],
                    variantMatrix: [{ sku: null }],
                },
            ],
            [
                "upsertProduct",
                {
                    description: null,
                    brandId: null,
                    brand: null,
                    primaryCategoryId: null,
                    primaryCategory: null,
                    variantAxes: [{ fieldKey: null }],
                },
            ],
            ["categories", { items: [{ parentId: null, description: null }] }],
            ["category", { parentId: null, description: null, parent: null }],
            [
                "manageProduct",
                {
                    id: null,
                    description: null,
                    brandId: null,
                    brand: null,
                    primaryCategoryId: null,
                    primaryCategory: null,
                    media: [{ media: { alt: null } }],
                    mainImageMediaId: null,
                    variantAxes: [{ fieldKey: null }],
                    variants: [{ sku: null }],
                    variantMatrix: [{ sku: null }],
                },
            ],
        ];
        expectProjections(endpoints, cases);
    });

    test("preserves offer nulls in list, detail, seller, and admin variants", async () => {
        const endpoints = await commerceEndpoints();
        const listItem = {
            variantId: null,
            description: null,
            quantityAvailable: null,
            mainImageMediaId: null,
        };
        const detail = {
            id: null,
            productId: null,
            ...listItem,
            acceptedPriceAmount: null,
            media: [{ media: { alt: null } }],
            variant: null,
            priceRule: null,
            priceProposals: [{ decisionReason: null, decidedAt: null }],
        };
        const cases: Array<[string, unknown]> = [
            [
                "offers",
                {
                    items: [
                        { ...listItem, media: [{ media: { alt: null } }], variant: null },
                        { variant: { sku: null } },
                    ],
                },
            ],
            ["offer", { ...listItem, media: [{ media: { alt: null } }], variant: null }],
            ["listMyOffers", { items: [{ ...listItem, acceptedPriceAmount: null, sellerDisplayPriceAmount: null }] }],
            ["myOffer", detail],
            [
                "manageOffers",
                {
                    items: [
                        {
                            variantId: null,
                            description: null,
                            acceptedPriceAmount: null,
                            quantityAvailable: null,
                        },
                    ],
                },
            ],
            ["manageOffer", detail],
            [
                "submitMyOfferPrice",
                {
                    offer: { variantId: null, description: null, acceptedPriceAmount: null, quantityAvailable: null },
                    proposal: { decidedBy: null, decisionReason: null, decidedAt: null },
                },
            ],
        ];
        expectProjections(endpoints, cases);
    });

    test("preserves nullable seller, cart, and order state", async () => {
        const endpoints = await commerceEndpoints();
        const cart = {
            currency: null,
            items: [{ currentUnitAmount: null, quantityAvailable: null, variant: null }, { variant: { sku: null } }],
        };
        const order = {
            deliveryQuotedAt: null,
            lines: [
                {
                    variantId: null,
                    acceptedProposalId: null,
                    sku: null,
                    variantSnapshot: null,
                },
            ],
            events: [{ previousStatus: null, nextStatus: null }],
            financialTerms: null,
        };
        const cases: Array<[string, unknown]> = [
            ["sellers", { items: [{ cmsUserId: null, verifiedAt: null, verifiedBy: null }] }],
            ["seller", { cmsUserId: null, verifiedAt: null, verifiedBy: null }],
            ...["myCart", "removeMyCartItem", "clearMyCart"].map(
                (endpointId) => [endpointId, cart] as [string, unknown],
            ),
            ["upsertMyCartItem", { ...cart, currency: "eur" }],
            ["myOrders", { items: [{ operation: null }, { operation: { claimStatus: null } }] }],
            ["myOrder", order],
            ["mySales", { items: [{ deliveryQuotedAt: null }] }],
            ["mySale", { ...order, events: [{ previousStatus: null, nextStatus: null }] }],
        ];
        expectProjections(endpoints, cases);
    });

    test("preserves nullable protected-commerce workflow state", async () => {
        const endpoints = await commerceEndpoints();
        const cases: Array<[string, unknown, string?]> = [
            ["cancelMyOrder", { refundAuthorization: null, paymentCancellationAuthorization: null }, "201"],
            ["recordOrderPayment", { providerPaymentIntentId: null, providerChargeId: null }],
            [
                "recordOrderFulfillment",
                {
                    providerReference: null,
                    carrierAcceptedAt: null,
                    sellerHandoffDeclaredAt: null,
                    recipientHandoffAt: null,
                    recipientHandoffFirstObservedAt: null,
                    claimWindowStartedAt: null,
                    claimByAt: null,
                    releaseEligibleAt: null,
                    blockingReason: null,
                },
            ],
            [
                "protectedPayments",
                {
                    items: [
                        {
                            claimStatus: null,
                            recipientHandoffAt: null,
                            recipientHandoffFirstObservedAt: null,
                            claimWindowStartedAt: null,
                            claimByAt: null,
                            releaseEligibleAt: null,
                        },
                    ],
                },
            ],
            [
                "claim",
                {
                    buyerRequestedAmount: null,
                    resolutionOutcome: null,
                    returnShipByAt: null,
                    returnDeliveryStatus: null,
                    returnProviderReference: null,
                    returnCarrierAcceptedAt: null,
                    returnRecipientHandoffAt: null,
                    events: [{ message: null }],
                    evidence: [{ description: null }],
                },
            ],
            ["refundRequests", { items: [{ claimId: null, firstApprovedBy: null }] }],
            ["getOrderFulfillmentAuthorization", { allowed: true, reason: null }],
        ];
        expectProjections(endpoints, cases);
    });
});
let endpointsPromise: Promise<Endpoint[]> | undefined;
function commerceEndpoints(): Promise<Endpoint[]> {
    endpointsPromise ??= loadIntegrationDefinition<Definition>(definitionPath).then((definition) => {
        return definition.artifacts.find((artifact) => artifact.source)?.source?.endpoints ?? [];
    });
    return endpointsPromise;
}
function expectProjections(endpoints: Endpoint[], cases: Array<[string, unknown, string?]>): void {
    for (const [endpointId, value, status = "200"] of cases) {
        const endpoint = endpoints.find((candidate) => candidate.endpointId === endpointId);
        const response = endpoint?.output?.find((candidate) => candidate.status === status);
        const shape = response?.triggerBody ?? response?.body;
        if (!shape) {
            throw new Error(`Missing ${status} response body for ${endpointId}`);
        }

        expect(projectStrictDataShape(value, shape, "response", { enforceRequired: false })).toEqual(value);
    }
}
