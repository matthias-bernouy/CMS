import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    expectSingleRpc,
    installCommerceTestEnvironment,
    requestCommerce,
    supabaseUrl,
} from "../../harness";
import { useFullOfferDetailResponder } from "./fixtures";

installCommerceTestEnvironment();

const readModel = "get_managed_offer_read_model";

describe("commerce optimized offer detail read budgets", () => {
    test("loads the complete seller detail in one actor-scoped call", async () => {
        useFullOfferDetailResponder();

        const response = await requestCommerce("/me/offer?id=91", {
            userId: "seller-user-123",
        });

        expect(response.status).toBe(200);
        expect(expectSingleRpc(readModel).body).toEqual({
            p_scope: "self",
            p_offer_id: 91,
            p_slug: null,
            p_cms_user_id: "seller-user-123",
        });
    });

    test("loads the complete administrator detail in one call without inventing a role check", async () => {
        useFullOfferDetailResponder();

        const response = await requestCommerce("/admin/offer?id=91", { userRole: null });

        expect(response.status).toBe(200);
        expect(expectSingleRpc(readModel).body).toEqual({
            p_scope: "admin",
            p_offer_id: 91,
            p_slug: null,
            p_cms_user_id: null,
        });
    });

    for (const scenario of optionalScenarios) {
        test(`keeps one call when ${scenario.label}`, async () => {
            useFullOfferDetailResponder(scenario.options);

            const seller = await requestCommerce("/me/offer?id=91", {
                userId: "seller-user-123",
            });
            const admin = await requestCommerce("/admin/offer?id=91", { userRole: null });
            const calls = managedCalls();

            expect({ seller: seller.status, admin: admin.status }).toEqual({ seller: 200, admin: 200 });
            expect(calls).toHaveLength(2);
            expect(calls.map((call) => call.body.p_scope)).toEqual(["self", "admin"]);
        });
    }
});

function managedCalls() {
    const calls = capturedFetches();
    for (const call of calls) {
        expect(call.url).toBe(`${supabaseUrl}/rest/v1/rpc/${readModel}`);
        expect(call.method).toBe("POST");
        expect(call.headers.get("apikey")).toBe("sb_secret_test");
        expect(call.headers.get("authorization")).toBeNull();
    }
    return calls;
}

const optionalScenarios = [
    { label: "only the variant is absent", options: { variantId: null } },
    { label: "only the brand is absent", options: { brandId: null } },
    { label: "the variant and brand are absent", options: { variantId: null, brandId: null } },
] as const;
