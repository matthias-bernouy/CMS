import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../../harness";

installCommerceTestEnvironment();

const workflowStates = [
    { code: "draft", label: "Draft", phase: "draft", terminal: false },
    { code: "pending_review", label: "Pending review", phase: "admin_review", terminal: false },
    { code: "changes_requested", label: "Changes requested", phase: "seller_input", terminal: false },
    { code: "rejected", label: "Rejected", phase: "terminal", terminal: true },
    { code: "archived", label: "Archived", phase: "terminal", terminal: true },
];
const sellerReadModelRpc = "list_seller_offers_read_model";

describe("commerce seller offer read boundaries", () => {
    test("requires a CMS user before resolving a seller", async () => {
        const response = await requestCommerce("/me/offers");

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "missing CMS user id" });
        expect(capturedFetches()).toEqual([]);
    });

    test("returns the empty seller page before validating an unknown display status", async () => {
        setRestResponder((request) => {
            expect(resourceName(request)).toBe(sellerReadModelRpc);
            return jsonResponse(
                sellerBundle({
                    seller_exists: false,
                    workflow_states: [],
                }),
            );
        });

        const response = await requestCommerce("/me/offers?status=unknown&limit=4&offset=8", {
            userId: "user-without-seller",
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ items: [], total: 0, limit: 4, offset: 8 });
        expect(resources()).toEqual([sellerReadModelRpc]);
        expect(rpcBodies()).toEqual([
            {
                p_cms_user_id: "user-without-seller",
                p_status: "unknown",
                p_limit: 4,
                p_offset: 8,
            },
        ]);
    });

    test("rejects an unknown display status after resolving the seller and workflow states", async () => {
        useSellerResponder({ status_valid: false });

        const response = await requestCommerce("/me/offers?status=unknown", {
            userId: "seller-user-123",
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "status is invalid" });
        expect(resources()).toEqual([sellerReadModelRpc]);
        expect(rpcBodies()).toEqual([
            {
                p_cms_user_id: "seller-user-123",
                p_status: "unknown",
                p_limit: 50,
                p_offset: 0,
            },
        ]);
    });

    test("rejects an invalid limit before identity or PostgREST work", async () => {
        const response = await requestCommerce("/me/offers?limit=invalid", {
            userId: "seller-user-123",
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "limit must be an integer" });
        expect(capturedFetches()).toEqual([]);
    });

    test("gives the display status precedence only over its matching explicit filter", async () => {
        useSellerResponder();

        const online = await requestCommerce(
            "/me/offers?status=online&publicationStatus=paused&workflowState=changes_requested",
            { userId: "seller-user-123" },
        );
        const review = await requestCommerce(
            "/me/offers?status=under_review&publicationStatus=paused&workflowState=changes_requested",
            { userId: "seller-user-123" },
        );

        expect({ online: online.status, review: review.status }).toEqual({ online: 200, review: 200 });
        expect(rpcBodies()).toEqual([
            {
                p_cms_user_id: "seller-user-123",
                p_status: "online",
                p_publication_status: "paused",
                p_workflow_state: "changes_requested",
                p_limit: 50,
                p_offset: 0,
            },
            {
                p_cms_user_id: "seller-user-123",
                p_status: "under_review",
                p_publication_status: "paused",
                p_workflow_state: "changes_requested",
                p_limit: 50,
                p_offset: 0,
            },
        ]);
        expect(resources()).toEqual([sellerReadModelRpc, sellerReadModelRpc]);
    });

    test("sanitizes PostgREST search syntax and clamps pagination", async () => {
        useSellerResponder();

        const response = await requestCommerce("/me/offers?q=Blade%2C%28Pro%29%2A&limit=150&offset=-4", {
            userId: "seller-user-123",
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ items: [], total: 0, limit: 100, offset: 0 });
        expect(rpcBodies()).toEqual([
            {
                p_cms_user_id: "seller-user-123",
                p_query: "Blade  Pro  ",
                p_limit: 100,
                p_offset: 0,
            },
        ]);
        expect(resources()).toEqual([sellerReadModelRpc]);
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

function rpcBodies(): Record<string, unknown>[] {
    return capturedFetches().map((call) => call.body);
}

function resources(): string[] {
    return capturedFetches().map((call) => resourceName(call));
}

function resourceName(request: Request | { url: string }): string {
    return new URL(request.url).pathname.split("/").at(-1)!;
}
