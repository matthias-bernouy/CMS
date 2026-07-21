import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    requestCommerce,
    setRestResponder,
    supabaseUrl,
} from "../../harness";
import { nullOfferDetail } from "./expected";
import { managedOfferResponse, managedOfferState, useFullOfferDetailResponder } from "./fixtures";

installCommerceTestEnvironment();

const readModel = "get_managed_offer_read_model";

describe("commerce optimized offer detail boundary budgets", () => {
    test("uses one read-model call for a missing seller or administrator detail", async () => {
        setRestResponder(() => managedOfferState("not_found"));

        const seller = await requestCommerce("/me/offer?id=404");
        const admin = await requestCommerce("/admin/offer?id=404", { userRole: null });
        const calls = managedCalls();

        expect({ seller: seller.status, admin: admin.status }).toEqual({ seller: 404, admin: 404 });
        expect(calls).toHaveLength(2);
        expect(calls.map((call) => call.body)).toEqual([
            { p_scope: "self", p_offer_id: 404, p_slug: null, p_cms_user_id: null },
            { p_scope: "admin", p_offer_id: 404, p_slug: null, p_cms_user_id: null },
        ]);
    });

    test("uses one actor-scoped call for every seller ownership refusal", async () => {
        const scenarios = [
            { state: "not_found", userId: undefined, status: 404 },
            { state: "not_found", userId: "seller-user-123", status: 404 },
            { state: "identity_required", userId: undefined, status: 401 },
        ] as const;

        for (const scenario of scenarios) {
            setRestResponder(() => managedOfferState(scenario.state));
            const before = capturedFetches().length;
            const response = await requestCommerce("/me/offer?id=91", {
                userId: scenario.userId,
            });

            expect(response.status).toBe(scenario.status);
            expect(managedCalls()).toHaveLength(before + 1);
        }
    });

    test("uses one call when every optional related row is absent", async () => {
        setRestResponder(() => managedOfferResponse(nullOfferDetail));

        const response = await requestCommerce("/me/offer?id=91", {
            userId: "seller-user-123",
        });

        expect(response.status).toBe(200);
        expect(managedCalls()).toHaveLength(1);
    });

    test("passes only the winning selector to the single read-model call", async () => {
        useFullOfferDetailResponder();

        const seller = await requestCommerce("/me/offer?slug=camera-offer", {
            userId: "seller-user-123",
        });
        const admin = await requestCommerce("/admin/offer?id=91&slug=wrong", { userRole: null });
        const calls = managedCalls();

        expect({ seller: seller.status, admin: admin.status }).toEqual({ seller: 200, admin: 200 });
        expect(calls.map((call) => call.body)).toEqual([
            {
                p_scope: "self",
                p_offer_id: null,
                p_slug: "camera-offer",
                p_cms_user_id: "seller-user-123",
            },
            { p_scope: "admin", p_offer_id: 91, p_slug: null, p_cms_user_id: null },
        ]);
    });
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
