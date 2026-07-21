import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../harness";

installCommerceTestEnvironment();

const workflowStates = [
    { code: "draft", label: "Draft", phase: "draft", terminal: false },
    { code: "pending_review", label: "Pending review", phase: "admin_review", terminal: false },
    { code: "archived", label: "Archived", phase: "terminal", terminal: true },
];
const sellerReadModelRpc = "list_seller_offers_read_model";

describe("commerce seller offer filter precedence", () => {
    test("returns the empty page before interpreting an invalid product id without a seller", async () => {
        setRestResponder((request) => {
            expect(resourceName(request)).toBe(sellerReadModelRpc);
            return jsonResponse(
                sellerBundle({
                    seller_exists: false,
                    workflow_states: [],
                }),
            );
        });

        const response = await requestCommerce("/me/offers?productId=not-an-integer", {
            userId: "user-without-seller",
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ items: [], total: 0, limit: 50, offset: 0 });
        expect(resources()).toEqual([sellerReadModelRpc]);
        expect(rpcBody()).toEqual({
            p_cms_user_id: "user-without-seller",
            p_product_id: "not-an-integer",
            p_limit: 50,
            p_offset: 0,
        });
    });

    test("rejects status before interpreting an invalid product id for an existing seller", async () => {
        useSellerResponder({ status_valid: false });

        const response = await requestCommerce("/me/offers?status=unknown&productId=not-an-integer", {
            userId: "seller-user-123",
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "status is invalid" });
        expect(resources()).toEqual([sellerReadModelRpc]);
        expect(rpcBody()).toEqual({
            p_cms_user_id: "seller-user-123",
            p_status: "unknown",
            p_product_id: "not-an-integer",
            p_limit: 50,
            p_offset: 0,
        });
    });

    test("lets search replace the archived OR while preserving explicit filters", async () => {
        useSellerResponder();

        const response = await requestCommerce(
            "/me/offers?status=archived&q=Blade&publicationStatus=paused" +
                "&workflowState=changes_requested&conditionCode=used&productId=42",
            { userId: "seller-user-123" },
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ items: [], total: 0, limit: 50, offset: 0 });
        expect(resources()).toEqual([sellerReadModelRpc]);
        expect(rpcBody()).toEqual({
            p_cms_user_id: "seller-user-123",
            p_status: "archived",
            p_publication_status: "paused",
            p_workflow_state: "changes_requested",
            p_condition_code: "used",
            p_product_id: "42",
            p_query: "Blade",
            p_limit: 50,
            p_offset: 0,
        });
    });

    test("ignores sellerId and keeps the authenticated seller ownership filter", async () => {
        useSellerResponder();

        const response = await requestCommerce("/me/offers?sellerId=999", {
            userId: "seller-user-123",
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ items: [], total: 0, limit: 50, offset: 0 });
        expect(resources()).toEqual([sellerReadModelRpc]);
        expect(rpcBody()).toEqual({
            p_cms_user_id: "seller-user-123",
            p_limit: 50,
            p_offset: 0,
        });
        expect(rpcBody()).not.toHaveProperty("p_seller_id");
    });

    test("surfaces the product bigint cast error before the variant cast error", async () => {
        const message = 'invalid input syntax for type bigint: "not-an-integer"';
        setRestResponder((request) => {
            const resource = resourceName(request);
            if (resource === sellerReadModelRpc) {
                return jsonResponse({ message }, 400);
            }
            throw new Error(`Unexpected seller offer request: ${request.url}`);
        });

        const response = await requestCommerce(
            "/me/offers?status=all&productId=not-an-integer&variantId=also-not-an-integer",
            { userId: "seller-user-123" },
        );

        expect(response.status).toBe(422);
        expect(await response.json()).toEqual({ error: message });
        expect(resources()).toEqual([sellerReadModelRpc]);
        expect(rpcBody()).toEqual({
            p_cms_user_id: "seller-user-123",
            p_status: "all",
            p_product_id: "not-an-integer",
            p_variant_id: "also-not-an-integer",
            p_limit: 50,
            p_offset: 0,
        });
        expect(Object.keys(rpcBody()).indexOf("p_product_id")).toBeLessThan(
            Object.keys(rpcBody()).indexOf("p_variant_id"),
        );
    });
});

function useSellerResponder(overrides: Record<string, unknown> = {}): void {
    setRestResponder((request) => {
        const resource = resourceName(request);
        if (resource === sellerReadModelRpc) {
            return jsonResponse(sellerBundle(overrides));
        }
        throw new Error(`Unexpected seller offer request: ${request.url}`);
    });
}

function sellerBundle(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        seller_exists: true,
        status_valid: true,
        rows: [],
        total: 0,
        workflow_states: workflowStates,
        media: [],
        active_price_proposals: [],
        ...overrides,
    };
}

function rpcBody(): Record<string, unknown> {
    expect(capturedFetches()).toHaveLength(1);
    return capturedFetches()[0]!.body;
}

function resources(): string[] {
    return capturedFetches().map((call) => resourceName(call));
}

function resourceName(request: Request | { url: string }): string {
    return new URL(request.url).pathname.split("/").at(-1)!;
}
