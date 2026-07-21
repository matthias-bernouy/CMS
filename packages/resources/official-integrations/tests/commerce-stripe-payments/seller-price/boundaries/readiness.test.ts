import { describe, expect, test } from "bun:test";
import { connectStatus } from "../fixtures";
import { executeSellerPrice } from "../harness";
import { sellerPriceResponder } from "../responders";

describe("Commerce Stripe seller enrollment readiness", () => {
    test("preserves every post-enrollment readiness predicate", async () => {
        const ready = connectStatus({
            enrolled: true,
            currentTermsAccepted: true,
        });
        const cases: Array<[string, unknown]> = [
            ["userId", "another-seller"],
            ["accountStatus", "closed"],
            ["termsStatus", "required"],
            ["stripeTermsStatus", "required"],
            ["marketplaceTermsStatus", "required"],
            ["marketplaceTermsCurrentVersionAccepted", false],
            ["enrollmentStatus", "terms_required"],
            ["canAcceptHeldPayments", false],
        ];

        for (const [field, value] of cases) {
            const { response, calls } = await executeSellerPrice(
                sellerPriceResponder({
                    enrollment: { ...ready, [field]: value },
                }),
            );

            expect(response.status).toBe(409);
            expect(await response.json()).toEqual({
                error: "Seller enrollment is not ready for held payments",
            });
            expect(calls.map(call => call.url.pathname)).toEqual([
                "/seller", "/status", "/enrollment",
            ]);
        }
    });
});
