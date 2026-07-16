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

describe("commerce seller offer filter precedence", () => {
    test("returns the empty page before interpreting an invalid product id without a seller", async () => {
        setRestResponder(request => {
            expect(resourceName(request)).toBe("sellers");
            return jsonResponse([]);
        });

        const response = await requestCommerce("/me/offers?productId=not-an-integer", {
            userId: "user-without-seller",
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ items: [], total: 0, limit: 50, offset: 0 });
        expect(resources()).toEqual(["sellers"]);
    });

    test("rejects status before interpreting an invalid product id for an existing seller", async () => {
        useSellerResponder();

        const response = await requestCommerce(
            "/me/offers?status=unknown&productId=not-an-integer",
            { userId: "seller-user-123" },
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "status is invalid" });
        expect(resources()).toEqual(["sellers", "offer_workflow_states"]);
    });

    test("lets search replace the archived OR while preserving explicit filters", async () => {
        useSellerResponder();

        const response = await requestCommerce(
            "/me/offers?status=archived&q=Blade&publicationStatus=paused"
                + "&workflowState=changes_requested&conditionCode=used&productId=42",
            { userId: "seller-user-123" },
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ items: [], total: 0, limit: 50, offset: 0 });
        const query = offersQuery();
        expect(query).toMatchObject({
            seller_id: "eq.7",
            publication_status: "eq.paused",
            workflow_state: "eq.changes_requested",
            condition_code: "eq.used",
            product_id: "eq.42",
            or: "(title.ilike.*Blade*,slug.ilike.*Blade*)",
        });
        expect(query.or).not.toContain("archived");
    });

    test("ignores sellerId and keeps the authenticated seller ownership filter", async () => {
        useSellerResponder();

        const response = await requestCommerce("/me/offers?sellerId=999", {
            userId: "seller-user-123",
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ items: [], total: 0, limit: 50, offset: 0 });
        expect(offersQuery().seller_id).toBe("eq.7");
    });

    test("surfaces the product bigint cast error before the variant cast error", async () => {
        const message = 'invalid input syntax for type bigint: "not-an-integer"';
        setRestResponder(request => {
            const resource = resourceName(request);
            if (resource === "sellers") return jsonResponse([{ id: 7 }]);
            if (resource === "offer_workflow_states") return jsonResponse(workflowStates);
            if (resource === "offers") {
                const url = new URL(request.url);
                expect(url.searchParams.get("product_id")).toBe("eq.not-an-integer");
                expect(url.searchParams.get("variant_id")).toBe("eq.also-not-an-integer");
                expect(url.search.indexOf("product_id=")).toBeLessThan(url.search.indexOf("variant_id="));
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
        expect(resources()).toEqual(["sellers", "offer_workflow_states", "offers"]);
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

function offersQuery(): Record<string, string> {
    const call = capturedFetches().find(item => resourceName(item) === "offers");
    if (!call) throw new Error("Missing offers request");
    return Object.fromEntries(new URL(call.url).searchParams);
}

function resources(): string[] {
    return capturedFetches().map(call => resourceName(call));
}

function resourceName(request: Request | { url: string }): string {
    return new URL(request.url).pathname.split("/").at(-1)!;
}
