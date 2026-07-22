import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    expectRpc,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../harness";
import {
    pick,
    sellerConsumedFields,
    sellerProjection,
    sellerRow,
    settingsConsumedFields,
    settingsProjection,
} from "./post-action-parity-fixtures";

installCommerceTestEnvironment();

describe("commerce marketplace post-action parity", () => {
    test("returns the exact saved settings read model", async () => {
        const row = {
            id: "default",
            mode: "hybrid",
            default_currency: "eur",
            require_verified_seller: true,
            offer_moderation: "none",
            price_policy: "free",
            auto_approve_price_in_range: false,
            require_final_price_approval: true,
            seller_can_publish: false,
            active_c2c_fee_policy_id: 101,
            active_c2c_protection_policy_id: 102,
            active_c2c_seller_risk_policy_id: 103,
            version: 8,
            created_at: "2026-07-01T08:00:00Z",
            updated_at: "2026-07-22T09:30:00Z",
        };
        setRestResponder((request) =>
            new URL(request.url).pathname.endsWith("/rpc/update_settings") ? jsonResponse(row) : jsonResponse([row]),
        );

        const mutation = await requestCommerce("/admin/settings", {
            body: {
                expectedVersion: 7,
                mode: "hybrid",
                defaultCurrency: "eur",
                requireVerifiedSeller: true,
                offerModeration: "none",
                pricePolicy: "free",
                autoApprovePriceInRange: false,
                requireFinalPriceApproval: true,
                sellerCanPublish: false,
            },
        });
        const saved = await mutation.json();
        const detail = await requestCommerce("/admin/settings");
        const fetched = await detail.json();

        expect(mutation.status).toBe(200);
        expect(detail.status).toBe(200);
        expect(saved).toEqual(settingsProjection);
        expect(fetched).toEqual(settingsProjection);
        expect(saved).toEqual(fetched);
        expect(pick(saved as Record<string, unknown>, settingsConsumedFields)).toEqual(
            pick(settingsProjection, settingsConsumedFields),
        );
        expect(capturedFetches()).toHaveLength(2);
        expect(expectRpc("update_settings").body).toEqual({
            p_payload: {
                mode: "hybrid",
                defaultCurrency: "eur",
                offerModeration: "none",
                pricePolicy: "free",
                requireVerifiedSeller: true,
                autoApprovePriceInRange: false,
                requireFinalPriceApproval: true,
                sellerCanPublish: false,
            },
            p_expected_version: 7,
        });
        expect(restPaths()).toEqual(["/rest/v1/rpc/update_settings", "/rest/v1/settings"]);
    });

    for (const scenario of [
        { status: "verified", verifiedAt: "2026-07-22T10:00:00Z", verifiedBy: "admin-user" },
        { status: "suspended", verifiedAt: null, verifiedBy: null },
    ] as const) {
        test(`returns the exact ${scenario.status} seller read model`, async () => {
            const row = sellerRow(scenario);
            setRestResponder((request) =>
                new URL(request.url).pathname.endsWith("/rpc/review_seller") ? jsonResponse(row) : jsonResponse([row]),
            );

            const mutation = await requestCommerce("/admin/seller/review?id=184", {
                userId: "admin-user",
                body: { status: scenario.status, reason: "manual review", expectedVersion: 4 },
            });
            const saved = await mutation.json();
            const detail = await requestCommerce("/admin/seller?id=184");
            const fetched = await detail.json();
            const expected = sellerProjection(scenario);

            expect(mutation.status).toBe(200);
            expect(detail.status).toBe(200);
            expect(saved).toEqual(expected);
            expect(fetched).toEqual(expected);
            expect(saved).toEqual(fetched);
            expect(saved).not.toHaveProperty("reviewReason");
            expect(pick(saved as Record<string, unknown>, sellerConsumedFields)).toEqual(
                pick(expected, sellerConsumedFields),
            );
            expect(capturedFetches()).toHaveLength(2);
            expect(expectRpc("review_seller").body).toEqual({
                p_seller_id: 184,
                p_status: scenario.status,
                p_admin_id: "admin-user",
                p_reason: "manual review",
                p_expected_version: 4,
            });
            expect(restPaths()).toEqual(["/rest/v1/rpc/review_seller", "/rest/v1/sellers"]);
        });
    }
});

function restPaths(): string[] {
    return capturedFetches().map((request) => new URL(request.url).pathname);
}
