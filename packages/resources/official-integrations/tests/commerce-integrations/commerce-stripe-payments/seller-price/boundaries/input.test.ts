import { describe, expect, test } from "bun:test";
import { successfulInput } from "../fixtures";
import { executeSellerPrice, expectGenericFailure, sellerPriceRequest } from "../harness";
import { privateFailure, sellerPriceResponder } from "../responders";

describe("Commerce Stripe seller price input boundaries", () => {
    test("rejects malformed declared input before source work", async () => {
        for (const [body, error] of [
            [{ amount: 12_000, expectedVersion: 3 }, "body.offerId is required"],
            [{ ...successfulInput, offerId: 42 }, "body.offerId must be a string"],
            [{ ...successfulInput, amount: "12000" }, "body.amount must be a number"],
            [{ ...successfulInput, expectedVersion: "3" }, "body.expectedVersion must be a number"],
            [{ ...successfulInput, contactEmail: "attacker@example.test" }, "body.contactEmail is not allowed"],
            [{ ...successfulInput, accountToken: null }, "body.accountToken must be a string"],
            [{ ...successfulInput, sellerTermsAccepted: null }, "body.sellerTermsAccepted must be a boolean"],
        ] as const) {
            const { response, calls } = await executeSellerPrice(sellerPriceResponder(), {
                request: sellerPriceRequest(body),
            });
            expect(response.status).toBe(400);
            expect(await response.json()).toEqual({ error });
            expect(calls).toEqual([]);
        }
    });

    test("preserves the bodyless request as a terms refusal after setup", async () => {
        const { response, calls } = await executeSellerPrice(sellerPriceResponder(), {
            request: sellerPriceRequest(undefined),
        });

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({
            error: "The current seller terms must be accepted before submitting a price",
        });
        expect(calls.map((call) => call.url.pathname)).toEqual(["/seller", "/status"]);
    });

    test("keeps late Commerce validation after Stripe side effects", async () => {
        for (const [input, expectedQuery, expectedBody] of [
            [
                { ...successfulInput, offerId: "not-an-integer" },
                "not-an-integer",
                { amount: 12_000, expectedVersion: 3 },
            ],
            [{ ...successfulInput, amount: 12_000.5 }, "42", { amount: 12_000.5, expectedVersion: 3 }],
            [{ ...successfulInput, expectedVersion: 3.5 }, "42", { amount: 12_000, expectedVersion: 3.5 }],
        ] as const) {
            const { response, calls } = await executeSellerPrice(
                sellerPriceResponder({
                    result: privateFailure(400, "late Commerce validation"),
                }),
                { request: sellerPriceRequest(input) },
            );
            await expectGenericFailure(response);
            expect(calls.map((call) => call.url.pathname)).toEqual([
                "/seller",
                "/status",
                "/enrollment",
                "/offer/price",
            ]);
            expect(calls[3]?.url.searchParams.get("id")).toBe(expectedQuery);
            expect(calls[3]?.body).toEqual(expectedBody);
        }
    });
});
