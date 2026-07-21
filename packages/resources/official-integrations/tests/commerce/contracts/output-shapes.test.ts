import { describe, expect, test } from "bun:test";
import { projectStrictDataShape, type DataShape } from "@bernouy/cms-sources";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { installCommerceTestEnvironment, jsonResponse, requestCommerce, setRestResponder } from "../harness";

type Shape = DataShape;
type Endpoint = {
    endpointId: string;
    method?: string;
    access?: string;
    params?: Array<{ name: string; in: string; type: string; required?: boolean }>;
    headers?: Array<{
        name: string;
        source?: { from: string; ref: string; prefix?: string };
    }>;
    output?: Array<{ body?: Shape }>;
};
type Definition = { artifacts: Array<{ source?: { endpoints: Endpoint[] } }> };

const definitionPath = resolve(import.meta.dir, "../../../integrations/commerce/versions/1.0.0/definition.json");

installCommerceTestEnvironment();

describe("commerce response contracts", () => {
    test("declares the exact actor-scoped buyer order contexts", async () => {
        const endpoints = await commerceEndpoints();
        const fields = ["id", "publicId", "buyerCmsUserId"];
        const contracts = [
            {
                id: "getPaymentOrderContext",
                param: { type: "number", required: true },
                required: fields,
            },
            {
                id: "getOrderFulfillmentBuyerContext",
                param: { type: "string" },
                required: undefined,
            },
        ];

        for (const contract of contracts) {
            const endpoint = endpoints.find((candidate) => candidate.endpointId === contract.id);
            const body = endpoint?.output?.[0]?.body;
            expect(endpoint).toMatchObject({
                method: "GET",
                access: "system",
            });
            expect(endpoint?.params).toEqual([
                {
                    name: "orderId",
                    in: "query",
                    ...contract.param,
                },
            ]);
            expect(endpoint?.headers).toEqual([
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
            ]);
            expect(Object.keys(body?.properties ?? {})).toEqual(fields);
            expect(body?.required).toEqual(contract.required);
            expect(body?.properties?.buyerCmsUserId?.semantic).toEqual({
                kind: "user-id",
                authority: "cms",
            });
        }
    });

    test("declares the exact bounded negotiation context as a system endpoint", async () => {
        const endpoint = (await commerceEndpoints()).find(
            (candidate) => candidate.endpointId === "getOfferNegotiationContext",
        );
        const fields = [
            "offerId",
            "offerSlug",
            "offerTitle",
            "sellerCmsUserId",
            "sellerDisplayName",
            "referenceAmount",
            "currency",
            "publicationStatus",
            "availability",
        ];
        const body = endpoint?.output?.[0]?.body;

        expect(endpoint).toMatchObject({
            method: "GET",
            access: "system",
            params: [
                {
                    name: "offerId",
                    in: "query",
                    type: "number",
                    required: true,
                },
            ],
        });
        expect(endpoint?.headers?.map((header) => header.name)).toEqual(["authorization"]);
        expect(Object.keys(body?.properties ?? {})).toEqual(fields);
        expect(body?.required).toEqual(fields);
        expect(
            Object.entries(body?.properties ?? {})
                .filter(([, shape]) => shape.nullable)
                .map(([name]) => name),
        ).toEqual(["sellerCmsUserId", "referenceAmount"]);
        expect(body?.properties?.sellerCmsUserId?.semantic?.authority).toBe("cms");
    });

    test("declares usable fields for every structured JSON response", async () => {
        const endpoints = await commerceEndpoints();
        const violations: string[] = [];

        for (const endpoint of endpoints) {
            for (const response of endpoint.output ?? []) {
                if (!response.body) {
                    continue;
                }
                if (response.body.type === "object" && !hasProperties(response.body)) {
                    violations.push(`${endpoint.endpointId}: opaque response object`);
                }
                findOpaqueArrayItems(response.body, endpoint.endpointId, violations);
            }
        }

        expect(violations).toEqual([]);
        expect(itemFields(endpoints, "products")).toEqual(expect.arrayContaining(["id", "slug", "title", "status"]));
        expect(rootFields(endpoints, "product")).toEqual(
            expect.arrayContaining(["id", "media", "variantAxes", "variantMatrix"]),
        );
        expect(itemFields(endpoints, "offers")).toEqual(
            expect.arrayContaining(["id", "productId", "acceptedPriceAmount"]),
        );
        expect(itemFields(endpoints, "offers")).not.toContain("sellerId");
        expect(rootFields(endpoints, "offer")).toEqual(
            expect.arrayContaining(["product", "priceRule", "priceProposals"]),
        );
        expect(rootFields(endpoints, "offer")).not.toContain("seller");
        expect(rootFields(endpoints, "order")).toEqual(expect.arrayContaining(["lines", "events", "seller"]));
        expect(rootFields(endpoints, "myOrder")).toEqual(
            expect.arrayContaining(["shippingAmount", "deliveryQuotedAt", "financialTerms"]),
        );
        expect(nestedFields(endpoints, "myOrder", "financialTerms")).toEqual(
            expect.arrayContaining([
                "deliveryQuoteId",
                "merchandiseSubtotalAmount",
                "shippingAmount",
                "buyerProtectionFeeAmount",
                "buyerTotalAmount",
                "currency",
            ]),
        );
        expect(rootFields(endpoints, "lockOrderFinancialTerms")).toContain("buyerProtectionFeeAmount");
        expect(itemFields(endpoints, "mySales")).toEqual(
            expect.arrayContaining(["id", "shippingAmount", "totalAmount"]),
        );
        expect(rootFields(endpoints, "mySale")).toEqual(
            expect.arrayContaining(["id", "lines", "events", "financialTerms"]),
        );
        expect(nestedFields(endpoints, "mySale", "financialTerms")).toEqual(
            expect.arrayContaining([
                "orderId",
                "merchandiseSubtotalAmount",
                "shippingAmount",
                "sellerCommissionAmount",
                "platformShippingShareAmount",
                "sellerShippingShareAmount",
                "sellerProceedsAmount",
                "sellerTransferReleaseAmount",
                "sellerReserveLiabilityAmount",
                "currency",
                "financialRevision",
            ]),
        );
        expect(rootFields(endpoints, "mySale")).not.toEqual(
            expect.arrayContaining([
                "sellerId",
                "buyerCmsUserId",
                "shippingAddress",
                "billingAddress",
                "idempotencyKey",
            ]),
        );
    });

    test("declares structured metadata entries on every buyer and seller order response", async () => {
        const endpoints = await commerceEndpoints();

        expect(rootFields(endpoints, "myOrder")).toEqual(expect.arrayContaining(["metadata", "metadataEntries"]));
        expect(itemFields(endpoints, "myOrders")).toEqual(expect.arrayContaining(["metadata", "metadataEntries"]));
        expect(rootFields(endpoints, "mySale")).toEqual(expect.arrayContaining(["metadata", "metadataEntries"]));
        expect(itemFields(endpoints, "mySales")).toEqual(expect.arrayContaining(["metadata", "metadataEntries"]));
        expect(rootFields(endpoints, "createOrder")).toEqual(expect.arrayContaining(["metadata", "metadataEntries"]));
        expect(nestedArrayItemFields(endpoints, "checkoutMyCart", "orders")).toEqual(
            expect.arrayContaining(["metadata", "metadataEntries"]),
        );
        expect(nestedItemMetadataEntryFields(endpoints, "checkoutMyCart", "orders")).toEqual(
            expect.arrayContaining(["key", "label", "type", "value", "unit"]),
        );
        for (const endpointId of ["myOrders", "mySales"]) {
            expect(itemMetadataEntryFields(endpoints, endpointId)).toEqual(
                expect.arrayContaining(["key", "label", "type", "value", "unit"]),
            );
        }
        for (const endpointId of ["myOrder", "mySale", "createOrder"]) {
            expect(metadataEntryFields(endpoints, endpointId)).toEqual(
                expect.arrayContaining(["key", "label", "type", "value", "unit"]),
            );
        }
    });

    test("preserves the exact buyer price breakdown through strict source projection", async () => {
        const endpoints = await commerceEndpoints();
        const deliveryQuotedAt = "2026-07-13T12:05:00.000Z";
        const buyerOrder = projectStrictDataShape(
            {
                id: 42,
                currency: "eur",
                subtotalAmount: 25_000,
                shippingAmount: 1_070,
                deliveryQuotedAt,
                totalAmount: 27_520,
                financialTerms: {
                    deliveryQuoteId: "quote-42",
                    merchandiseSubtotalAmount: 25_000,
                    shippingAmount: 1_070,
                    buyerProtectionFeeAmount: 1_450,
                    buyerTotalAmount: 27_520,
                    currency: "eur",
                    sellerCommissionAmount: 1_250,
                    platformRetainedAmount: 2_700,
                },
                internalSecret: "must-not-leak",
            },
            responseBody(endpoints, "myOrder"),
            "response",
            { enforceRequired: false },
        );

        expect(buyerOrder).toEqual({
            id: 42,
            currency: "eur",
            subtotalAmount: 25_000,
            shippingAmount: 1_070,
            deliveryQuotedAt,
            totalAmount: 27_520,
            financialTerms: {
                deliveryQuoteId: "quote-42",
                merchandiseSubtotalAmount: 25_000,
                shippingAmount: 1_070,
                buyerProtectionFeeAmount: 1_450,
                buyerTotalAmount: 27_520,
                currency: "eur",
            },
        });

        const lockedTerms = projectStrictDataShape(
            {
                orderId: 42,
                deliveryQuoteId: "quote-42",
                merchandiseSubtotalAmount: 25_000,
                shippingAmount: 1_070,
                buyerProtectionFeeAmount: 1_450,
                buyerTotalAmount: 27_520,
                sellerTransferReleaseAmount: 23_750,
                currency: "eur",
                financialTermsHash: "terms-42",
                financialRevision: 1,
            },
            responseBody(endpoints, "lockOrderFinancialTerms"),
            "response",
            { enforceRequired: false },
        );

        expect(lockedTerms).toMatchObject({
            shippingAmount: 1_070,
            buyerProtectionFeeAmount: 1_450,
            buyerTotalAmount: 27_520,
            currency: "eur",
        });
    });

    test("projects the immutable seller proceeds snapshot without the buyer total", async () => {
        const endpoints = await commerceEndpoints();
        const sellerSale = projectStrictDataShape(
            {
                id: 42,
                currency: "eur",
                totalAmount: 12_070,
                financialTerms: {
                    orderId: 42,
                    merchandiseSubtotalAmount: 11_000,
                    shippingAmount: 450,
                    sellerCommissionAmount: 550,
                    platformShippingShareAmount: 450,
                    sellerShippingShareAmount: 0,
                    sellerProceedsAmount: 10_450,
                    sellerTransferReleaseAmount: 9_950,
                    sellerReserveLiabilityAmount: 500,
                    currency: "eur",
                    pricingLockedAt: "2026-07-13T12:05:00.000Z",
                    payByAt: "2026-07-13T12:35:00.000Z",
                    financialRevision: 2,
                    buyerTotalAmount: 12_070,
                    platformRetainedAmount: 1_620,
                },
            },
            responseBody(endpoints, "mySale"),
            "response",
            { enforceRequired: false },
        );

        expect(sellerSale).toEqual({
            id: 42,
            currency: "eur",
            totalAmount: 12_070,
            financialTerms: {
                orderId: 42,
                merchandiseSubtotalAmount: 11_000,
                shippingAmount: 450,
                sellerCommissionAmount: 550,
                platformShippingShareAmount: 450,
                sellerShippingShareAmount: 0,
                sellerProceedsAmount: 10_450,
                sellerTransferReleaseAmount: 9_950,
                sellerReserveLiabilityAmount: 500,
                currency: "eur",
                pricingLockedAt: "2026-07-13T12:05:00.000Z",
                payByAt: "2026-07-13T12:35:00.000Z",
                financialRevision: 2,
            },
        });
    });

    test("returns the paging values declared by every paginated list", async () => {
        setRestResponder((request) => {
            const table = new URL(request.url).pathname.split("/").at(-1)!;
            if (table === "list_public_offers_read_model") {
                return jsonResponse({ settings_available: true, items: [], total: 0 });
            }
            if (table === "list_seller_offers_read_model") {
                return jsonResponse({
                    seller_exists: true,
                    status_valid: true,
                    rows: [],
                    total: 0,
                    workflow_states: [],
                    media: [],
                    active_price_proposals: [],
                });
            }
            if (table === "list_order_read_model") {
                return jsonResponse({
                    state: "ok",
                    orders: [],
                    operations: [],
                    definitions: [],
                    total: 0,
                });
            }
            const rows: Record<string, unknown[]> = {
                settings: [{ require_verified_seller: false }],
                products: [{ id: 1, metadata: {} }],
                offers: [{ id: 2, metadata: {} }],
                orders: [{ id: 3 }],
                sellers: [{ id: 4, cms_user_id: "seller-user" }],
                product_variants: [{ id: 5 }],
            };
            return jsonResponse(rows[table] ?? []);
        });
        const routes = [
            "/products",
            "/offers",
            "/me/offers",
            "/me/orders",
            "/me/sales",
            "/admin/products",
            "/admin/product/variants?productId=1",
            "/admin/sellers",
            "/admin/offers",
            "/admin/orders",
        ];

        for (const route of routes) {
            const separator = route.includes("?") ? "&" : "?";
            const response = await requestCommerce(`${route}${separator}limit=7&offset=3`, {
                userId: route.startsWith("/me/") ? "seller-user" : undefined,
            });
            expect({ route, status: response.status }).toEqual({ route, status: 200 });
            expect(await response.json()).toMatchObject({ limit: 7, offset: 3 });
        }
    });
});

async function commerceEndpoints(): Promise<Endpoint[]> {
    const definition = JSON.parse(await readFile(definitionPath, "utf8")) as Definition;
    return definition.artifacts.find((artifact) => artifact.source)?.source?.endpoints ?? [];
}

function responseBody(endpoints: Endpoint[], endpointId: string): Shape {
    const endpoint = endpoints.find((candidate) => candidate.endpointId === endpointId);
    const body = endpoint?.output?.find((response) => response.body)?.body;
    if (!body) {
        throw new Error(`Missing output body for ${endpointId}`);
    }
    return body;
}

function rootFields(endpoints: Endpoint[], endpointId: string): string[] {
    return Object.keys(responseBody(endpoints, endpointId).properties ?? {});
}

function itemFields(endpoints: Endpoint[], endpointId: string): string[] {
    const items = responseBody(endpoints, endpointId).properties?.items?.items;
    return Object.keys(items?.properties ?? {});
}

function nestedFields(endpoints: Endpoint[], endpointId: string, property: string): string[] {
    return Object.keys(responseBody(endpoints, endpointId).properties?.[property]?.properties ?? {});
}

function metadataEntryFields(endpoints: Endpoint[], endpointId: string): string[] {
    return nestedArrayItemFields(endpoints, endpointId, "metadataEntries");
}

function itemMetadataEntryFields(endpoints: Endpoint[], endpointId: string): string[] {
    const item = responseBody(endpoints, endpointId).properties?.items?.items;
    return Object.keys(item?.properties?.metadataEntries?.items?.properties ?? {});
}

function nestedArrayItemFields(endpoints: Endpoint[], endpointId: string, property: string): string[] {
    return Object.keys(responseBody(endpoints, endpointId).properties?.[property]?.items?.properties ?? {});
}

function nestedItemMetadataEntryFields(endpoints: Endpoint[], endpointId: string, property: string): string[] {
    const item = responseBody(endpoints, endpointId).properties?.[property]?.items;
    return Object.keys(item?.properties?.metadataEntries?.items?.properties ?? {});
}

function findOpaqueArrayItems(shape: Shape, path: string, violations: string[]): void {
    if (shape.type === "array" && shape.items) {
        if (shape.items.type === "object" && !hasProperties(shape.items)) {
            violations.push(`${path}: opaque array item`);
        }
        findOpaqueArrayItems(shape.items, `${path}[]`, violations);
    }
    for (const [key, child] of Object.entries(shape.properties ?? {})) {
        findOpaqueArrayItems(child, `${path}.${key}`, violations);
    }
}

function hasProperties(shape: Shape): boolean {
    return Object.keys(shape.properties ?? {}).length > 0;
}
