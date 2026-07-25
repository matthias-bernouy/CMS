import { describe, expect, test } from "bun:test";
import { connectStatus, offerResult, sellerCmsUserId, sellerTermsHash, sellerTermsVersion } from "./fixtures";
import { executeSellerPrice, loadSellerPriceFunction, sellerPriceRequest } from "./harness";
import { sellerPriceResponder } from "./responders";

describe("Commerce Stripe seller price contracts", () => {
    test("preserves the exact public contract and downstream payloads", async () => {
        const { response, calls, identities } = await executeSellerPrice(sellerPriceResponder());

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(offerResult);
        expect(calls.map((call) => [call.method, call.url.pathname])).toEqual([
            ["GET", "/seller"],
            ["GET", "/status"],
            ["POST", "/enrollment"],
            ["POST", "/seller/sale-capability"],
            ["POST", "/offer/price"],
        ]);
        expect(Object.fromEntries(calls[1]!.url.searchParams)).toEqual({
            marketplaceTermsVersion: sellerTermsVersion,
            marketplaceTermsHash: sellerTermsHash,
        });
        expect(calls[2]?.body).toEqual({
            accountToken: "accttok_first",
            marketplaceTermsAccepted: true,
            marketplaceTermsVersion: sellerTermsVersion,
            marketplaceTermsHash: sellerTermsHash,
        });
        expect(calls[3]?.body).toEqual({
            sellerCmsUserId,
            capabilityKey: "protected_payment",
            ready: true,
            evidenceReference: "stripe-connect:enrollment",
        });
        expect(Object.fromEntries(calls[4]!.url.searchParams)).toEqual({
            id: "42",
        });
        expect(calls[4]?.body).toEqual({
            amount: 12_000,
            expectedVersion: 3,
        });
        expect(calls.map((call) => call.cmsUserId)).toEqual([sellerCmsUserId, null, null, null, sellerCmsUserId]);
        expect(calls.map((call) => call.stripeUserId)).toEqual([null, sellerCmsUserId, sellerCmsUserId, null, null]);
        expect(
            await identities.resolve(
                {
                    authority: "commerce",
                    kind: "user",
                    value: 184,
                },
                "cms",
            ),
        ).toBe(sellerCmsUserId);
    });

    test("preserves authenticated POST input and output declarations", async () => {
        const fn = await loadSellerPriceFunction();

        expect(fn.method).toBe("POST");
        expect(fn.access).toEqual({ mode: "auth" });
        expect(fn.input.body).toMatchObject({
            type: "object",
            required: ["offerId", "amount", "expectedVersion"],
        });
        expect(fn.output).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ status: "200" }),
                expect.objectContaining({ status: "400" }),
                expect.objectContaining({ status: "403" }),
                expect.objectContaining({ status: "409" }),
            ]),
        );
    });

    test("preserves omitted optional enrollment fields when already enrolled", async () => {
        const alreadyEnrolled = await executeSellerPrice(
            sellerPriceResponder({
                status: connectStatus({
                    enrolled: true,
                    currentTermsAccepted: true,
                }),
            }),
            {
                request: sellerPriceRequest({
                    offerId: "42",
                    amount: 12_000,
                    expectedVersion: 3,
                }),
            },
        );

        expect(alreadyEnrolled.response.status).toBe(200);
        expect(await alreadyEnrolled.response.json()).toEqual(offerResult);
        expect(alreadyEnrolled.calls[2]?.body).toEqual({
            marketplaceTermsVersion: sellerTermsVersion,
            marketplaceTermsHash: sellerTermsHash,
        });
    });

    test("forwards the exact seller-visible terms identity for provider compare-and-set acceptance", async () => {
        const publishedVersion = `cms-page:${"b".repeat(64)}`;
        const publishedHash = "c".repeat(64);
        const result = await executeSellerPrice(sellerPriceResponder(), {
            request: sellerPriceRequest({
                offerId: "42",
                amount: 12_000,
                expectedVersion: 3,
                accountToken: "accttok_first",
                sellerTermsAccepted: true,
                sellerTermsVersion: publishedVersion,
                sellerTermsHash: publishedHash,
            }),
        });

        expect(result.response.status).toBe(200);
        expect(result.calls[2]?.body).toEqual({
            accountToken: "accttok_first",
            marketplaceTermsAccepted: true,
            marketplaceTermsVersion: sellerTermsVersion,
            marketplaceTermsHash: sellerTermsHash,
            expectedMarketplaceTermsVersion: publishedVersion,
            expectedMarketplaceTermsHash: publishedHash,
        });
    });
});
