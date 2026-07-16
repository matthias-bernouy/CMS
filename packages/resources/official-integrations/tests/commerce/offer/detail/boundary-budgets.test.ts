import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../harness";
import { offerRow, resourceName, useFullOfferDetailResponder } from "./fixtures";

installCommerceTestEnvironment();

describe("commerce current offer detail boundary budgets", () => {
    test("uses one offer read for a missing seller or administrator detail", async () => {
        setRestResponder(() => jsonResponse([]));

        const seller = await requestCommerce("/me/offer?id=404");
        const afterSeller = capturedFetches().length;
        const admin = await requestCommerce("/admin/offer?id=404", { userRole: null });

        expect({ seller: seller.status, admin: admin.status }).toEqual({ seller: 404, admin: 404 });
        expect(resources(0, afterSeller)).toEqual(["offers"]);
        expect(resources(afterSeller)).toEqual(["offers"]);
    });

    test("uses only offer and owner reads for every seller ownership refusal", async () => {
        const scenarios = [
            { owner: null, userId: undefined, status: 404 },
            { owner: "other-user", userId: "seller-user-123", status: 404 },
            { owner: "seller-user-123", userId: undefined, status: 401 },
        ] as const;

        for (const scenario of scenarios) {
            useOwnerResponder(scenario.owner);
            const start = capturedFetches().length;
            const response = await requestCommerce("/me/offer?id=91", {
                userId: scenario.userId,
            });

            expect(response.status).toBe(scenario.status);
            expect(resources(start)).toEqual(["offers", "sellers"]);
        }
    });

    test("uses seven reads for a seller detail whose related rows are absent", async () => {
        useNullRelatedResponder();

        const response = await requestCommerce("/me/offer?id=91", {
            userId: "seller-user-123",
        });

        expect(response.status).toBe(200);
        expect(resources()).toEqual([
            "offers", "sellers", "sellers", "products", "offer_price_rules",
            "offer_price_proposals", "offer_media",
        ]);
    });

    test("queries by slug for self and gives id precedence when both selectors exist", async () => {
        useFullOfferDetailResponder();

        const seller = await requestCommerce("/me/offer?slug=camera-offer", {
            userId: "seller-user-123",
        });
        const sellerCalls = capturedFetches().length;
        const admin = await requestCommerce("/admin/offer?id=91&slug=wrong", { userRole: null });
        const calls = capturedFetches();

        expect({ seller: seller.status, admin: admin.status }).toEqual({ seller: 200, admin: 200 });
        expect(new URL(calls[0]!.url).searchParams.get("slug")).toBe("eq.camera-offer");
        expect(new URL(calls[sellerCalls]!.url).searchParams.get("id")).toBe("eq.91");
        expect(new URL(calls[sellerCalls]!.url).searchParams.has("slug")).toBeFalse();
        expect(resources(0, sellerCalls)).toHaveLength(11);
        expect(resources(sellerCalls)).toHaveLength(9);
    });
});

function resources(start = 0, end?: number): string[] {
    return capturedFetches().slice(start, end).map(resourceName);
}

function useOwnerResponder(owner: string | null): void {
    setRestResponder(request => {
        const resource = resourceName(request);
        if (resource === "offers") return jsonResponse([offerRow]);
        if (resource === "sellers") {
            return jsonResponse(owner === null ? [] : [{ cms_user_id: owner }]);
        }
        throw new Error(`Unexpected ownership budget request: ${request.url}`);
    });
}

function useNullRelatedResponder(): void {
    setRestResponder(request => {
        const url = new URL(request.url);
        const resource = resourceName(request);
        if (resource === "offers") return jsonResponse([{ ...offerRow, variant_id: null }]);
        if (resource === "sellers" && url.searchParams.get("select") === "cms_user_id") {
            return jsonResponse([{ cms_user_id: "seller-user-123" }]);
        }
        if (["sellers", "products", "offer_price_rules"].includes(resource)) return jsonResponse([]);
        if (["offer_price_proposals", "offer_media"].includes(resource)) return jsonResponse([]);
        throw new Error(`Unexpected null-related budget request: ${request.url}`);
    });
}
