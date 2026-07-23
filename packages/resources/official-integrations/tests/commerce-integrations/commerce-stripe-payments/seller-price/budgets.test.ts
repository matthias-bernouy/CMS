import { describe, expect, test } from "bun:test";
import { offerResult, seller } from "./fixtures";
import { executeSellerPrice } from "./harness";
import { sellerPriceResponder } from "./responders";

describe("Commerce Stripe seller price call budgets", () => {
    test("keeps five ordered Source calls and one call per dependency", async () => {
        const { response, calls } = await executeSellerPrice(sellerPriceResponder());

        expect(response.status).toBe(200);
        expect(calls.map((call) => call.url.pathname)).toEqual([
            "/seller",
            "/status",
            "/enrollment",
            "/seller/sale-capability",
            "/offer/price",
        ]);
        expect(
            Object.fromEntries(
                calls.map((call) => [
                    call.url.pathname,
                    calls.filter((candidate) => candidate.url.pathname === call.url.pathname).length,
                ]),
            ),
        ).toEqual({
            "/seller": 1,
            "/status": 1,
            "/enrollment": 1,
            "/seller/sale-capability": 1,
            "/offer/price": 1,
        });
    });

    test("proves the full seller profile does not affect the public result", async () => {
        const profiles = [
            seller,
            {
                ...seller,
                displayName: "Another private name",
                verificationStatus: "verified",
                verifiedAt: "2026-07-13T11:00:00.000Z",
                metadata: {
                    contactEmail: "another-private@example.test",
                    address: "9 Secret Avenue",
                },
                version: 99,
            },
        ];

        for (const profile of profiles) {
            const { response, calls } = await executeSellerPrice(sellerPriceResponder({ seller: profile }));
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual(offerResult);
            expect(calls.map((call) => call.url.pathname)).toEqual([
                "/seller",
                "/status",
                "/enrollment",
                "/seller/sale-capability",
                "/offer/price",
            ]);
        }
    });
});
