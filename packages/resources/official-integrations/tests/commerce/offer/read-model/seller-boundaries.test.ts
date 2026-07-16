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
    { code: "changes_requested", label: "Changes requested", phase: "seller_input", terminal: false },
    { code: "rejected", label: "Rejected", phase: "terminal", terminal: true },
    { code: "archived", label: "Archived", phase: "terminal", terminal: true },
];

describe("commerce seller offer read boundaries", () => {
    test("requires a CMS user before resolving a seller", async () => {
        const response = await requestCommerce("/me/offers");

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "missing CMS user id" });
        expect(capturedFetches()).toEqual([]);
    });

    test("returns the empty seller page before validating an unknown display status", async () => {
        setRestResponder(request => {
            expect(resourceName(request)).toBe("sellers");
            return jsonResponse([]);
        });

        const response = await requestCommerce(
            "/me/offers?status=unknown&limit=4&offset=8",
            { userId: "user-without-seller" },
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ items: [], total: 0, limit: 4, offset: 8 });
        expect(capturedFetches().map(call => resourceName(call))).toEqual(["sellers"]);
    });

    test("rejects an unknown display status after resolving the seller and workflow states", async () => {
        useSellerResponder();

        const response = await requestCommerce("/me/offers?status=unknown", {
            userId: "seller-user-123",
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "status is invalid" });
        expect(capturedFetches().map(call => resourceName(call))).toEqual([
            "sellers", "offer_workflow_states",
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
        expect(offersQueries()).toEqual([
            expect.objectContaining({
                publication_status: "eq.active",
                workflow_state: "eq.changes_requested",
            }),
            expect.objectContaining({
                publication_status: "eq.paused",
                workflow_state: "in.(pending_review)",
            }),
        ]);
    });

    test("sanitizes PostgREST search syntax and clamps pagination", async () => {
        useSellerResponder();

        const response = await requestCommerce(
            "/me/offers?q=Blade%2C%28Pro%29%2A&limit=150&offset=-4",
            { userId: "seller-user-123" },
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ items: [], total: 0, limit: 100, offset: 0 });
        expect(offersQueries()).toEqual([expect.objectContaining({
            seller_id: "eq.7",
            or: "(title.ilike.*Blade  Pro  *,slug.ilike.*Blade  Pro  *)",
            limit: "100",
            offset: "0",
        })]);
    });
});

function useSellerResponder(): void {
    setRestResponder(request => {
        const resource = resourceName(request);
        if (resource === "sellers") return jsonResponse([{ id: 7 }]);
        if (resource === "offer_workflow_states") return jsonResponse(workflowStates);
        if (resource === "offers") return jsonResponse([], 200, { "content-range": "*/0" });
        throw new Error(`Unexpected seller offer request: ${request.url}`);
    });
}

function offersQueries(): Record<string, string>[] {
    return capturedFetches()
        .filter(call => resourceName(call) === "offers")
        .map(call => Object.fromEntries(new URL(call.url).searchParams));
}

function resourceName(request: Request | { url: string }): string {
    return new URL(request.url).pathname.split("/").at(-1)!;
}
