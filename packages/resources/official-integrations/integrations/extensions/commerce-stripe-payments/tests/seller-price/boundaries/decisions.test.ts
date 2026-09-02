import { describe, expect, test } from "bun:test";
import { InMemoryIdentityService } from "@bernouy/cms-identities";
import { connectStatus, seller } from "../fixtures";
import { executeSellerPrice, expectGenericFailure, sellerPriceRequest } from "../harness";
import { privateFailure, sellerPriceResponder, type SellerPriceReplies } from "../responders";

describe("Commerce Stripe seller price decision boundaries", () => {
    test("rejects absent or mismatched seller and Stripe identities", async () => {
        const cases: SellerPriceReplies[] = [
            { seller: { exists: false } },
            { seller: { ...seller, cmsUserId: "another-seller" } },
            { status: connectStatus({ userId: "another-seller" }) },
        ];

        for (const replies of cases) {
            const { response, calls } = await executeSellerPrice(sellerPriceResponder(replies));
            expect(response.status).toBe(403);
            expect(await response.json()).toEqual({
                error: "Seller enrollment identity mismatch",
            });
            expect(calls.map((call) => call.url.pathname)).toEqual(["/seller", "/status"]);
        }
    });

    test("keeps Stripe failure ahead of the missing-seller assertion", async () => {
        const { response, calls } = await executeSellerPrice(
            sellerPriceResponder({
                seller: { exists: false },
                status: privateFailure(500, "private Stripe outage"),
            }),
        );

        await expectGenericFailure(response);
        expect(calls.map((call) => call.url.pathname)).toEqual(["/seller", "/status"]);
    });

    test("preserves identity binding failures before Stripe work", async () => {
        const identities = new InMemoryIdentityService();
        await identities.bind("another-subject", {
            authority: "commerce",
            kind: "user",
            value: seller.id,
        });

        const { response, calls } = await executeSellerPrice(sellerPriceResponder(), { identities });

        await expectGenericFailure(response);
        expect(calls.map((call) => call.url.pathname)).toEqual(["/seller"]);
    });

    test("does not bind an identity for a missing seller", async () => {
        const { response, identities } = await executeSellerPrice(sellerPriceResponder({ seller: { exists: false } }));

        expect(response.status).toBe(403);
        expect(
            await identities.resolve(
                {
                    authority: "commerce",
                    kind: "user",
                    value: seller.id,
                },
                "cms",
            ),
        ).toBeNull();
    });

    test("preserves terms and account readiness refusals", async () => {
        for (const [request, error] of [
            [
                sellerPriceRequest({
                    offerId: "42",
                    amount: 12_000,
                    expectedVersion: 3,
                    accountToken: "accttok_first",
                }),
                "The current seller terms must be accepted before submitting a price",
            ],
            [
                sellerPriceRequest({
                    offerId: "42",
                    amount: 12_000,
                    expectedVersion: 3,
                    sellerTermsAccepted: true,
                }),
                "Seller enrollment is required before submitting a price",
            ],
        ] as const) {
            const { response, calls } = await executeSellerPrice(sellerPriceResponder(), { request });
            expect(response.status).toBe(409);
            expect(await response.json()).toEqual({ error });
            expect(calls).toHaveLength(2);
        }
    });

    test("records the capability before stopping when enrollment remains incomplete", async () => {
        const { response, calls } = await executeSellerPrice(
            sellerPriceResponder({
                enrollment: connectStatus({
                    enrolled: true,
                    currentTermsAccepted: false,
                }),
            }),
        );

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({
            error: "Seller enrollment is not ready for held payments",
        });
        expect(calls.map((call) => call.url.pathname)).toEqual([
            "/seller",
            "/status",
            "/enrollment",
            "/seller/sale-capability",
        ]);
        expect(calls[3]?.body).toEqual({
            sellerCmsUserId: "seller-subject",
            capabilityKey: "protected_payment",
            ready: true,
            evidenceReference: "stripe-connect:enrollment",
        });
    });

    test("redacts every dependency failure and stops causally", async () => {
        const cases: Array<[SellerPriceReplies, number]> = [
            [{ seller: privateFailure(500, "private seller") }, 1],
            [{ status: privateFailure(409, "private Stripe status") }, 2],
            [{ enrollment: privateFailure(400, "private token") }, 3],
            [{ capability: privateFailure(500, "private capability") }, 4],
            [{ result: privateFailure(409, "private offer") }, 5],
        ];

        for (const [replies, count] of cases) {
            const { response, calls } = await executeSellerPrice(sellerPriceResponder(replies));
            await expectGenericFailure(response);
            expect(calls).toHaveLength(count);
        }
    });

    test("keeps anonymous execution outside every dependency", async () => {
        const { response, calls } = await executeSellerPrice(sellerPriceResponder(), { user: null });

        await expectGenericFailure(response);
        expect(calls).toEqual([]);
    });
});
