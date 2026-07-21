import { describe, expect, test } from "bun:test";
import { expectGenericFailure } from "../../shared/harness";
import {
    labelAuthorization,
    sellerId,
} from "../shared/fixtures";
import {
    executeSellerFunction,
    sellerPostRequest,
} from "../shared/harness";
import { sellerResponder, type SellerReplies } from "../shared/responders";

const functionId = "requestShipmentLabelForMySale";
const privateFailure = (status: number) => Response.json({
    error: "private upstream failure",
    recipientAddress: "7 Private Street",
    providerPayload: { reference: "private-provider-reference" },
}, { status });

describe("seller shipment label boundaries", () => {
    test("rejects invalid JSON, body shapes, and unknown fields before calls", async () => {
        const invalidJson = new Request(`https://cms.test/functions/${functionId}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{",
        });
        const cases: Array<[Request, string]> = [
            [invalidJson, "Invalid JSON body"],
            [sellerPostRequest(functionId, []), "body must be an object"],
            [sellerPostRequest(functionId, {}), "body.orderId is required"],
            [sellerPostRequest(functionId, { orderId: null }), "body.orderId must be a string"],
            [sellerPostRequest(functionId, { orderId: 42 }), "body.orderId must be a string"],
            [sellerPostRequest(functionId, { orderId: "42", extra: true }), "body.extra is not allowed"],
        ];

        for (const [request, error] of cases) {
            const { response, calls } = await executeSellerFunction(
                functionId,
                request,
                sellerResponder(),
            );
            expect(response.status).toBe(400);
            expect(await response.json()).toEqual({ error });
            expect(calls).toEqual([]);
        }
    });

    test("preserves missing and invalid selector failures at the first call", async () => {
        const cases: Array<[Request, string | null]> = [
            [sellerPostRequest(functionId), null],
            [sellerPostRequest(functionId, { orderId: "" }), null],
            [sellerPostRequest(functionId, { orderId: "abc" }), "abc"],
            [sellerPostRequest(functionId, { orderId: "1.2" }), "1.2"],
            [sellerPostRequest(functionId, { orderId: "9007199254740992" }), "9007199254740992"],
        ];
        for (const [request, selector] of cases) {
            const { response, calls } = await executeSellerFunction(
                functionId,
                request,
                sellerResponder({ sale: privateFailure(400) }),
            );
            await expectGenericFailure(response);
            expect(calls).toHaveLength(1);
            expect(calls[0]?.url.pathname).toBe("/mySale");
            expect(calls[0]?.url.searchParams.get("id")).toBe(selector);
        }
    });

    test("fails anonymously before any upstream request", async () => {
        const { response, calls } = await executeSellerFunction(
            functionId,
            sellerPostRequest(functionId, { orderId: "42" }),
            sellerResponder(),
            null,
        );

        await expectGenericFailure(response);
        expect(calls).toEqual([]);
    });

    test("returns the same 409 for denial and seller mismatch", async () => {
        for (const authorization of [{
            ...labelAuthorization,
            allowed: false,
        }, {
            ...labelAuthorization,
            sellerCmsUserId: "another-seller",
        }]) {
            const { response, calls } = await executeSellerFunction(
                functionId,
                sellerPostRequest(functionId, { orderId: "42" }),
                sellerResponder({ authorization }),
            );
            expect(response.status).toBe(409);
            expect(await response.json()).toEqual({
                error: "Commerce has not authorized label access",
            });
            expect(calls.map(call => call.url.pathname)).toEqual([
                "/mySale",
                "/labelAuthorization",
            ]);
        }
    });

    test("redacts dependency errors and stops at their failing boundary", async () => {
        const cases: Array<[SellerReplies, number]> = [
            [{ sale: privateFailure(404) }, 1],
            [{ authorization: privateFailure(500) }, 2],
            [{ capability: privateFailure(404) }, 3],
            [{ capability: privateFailure(409) }, 3],
            [{ capability: privateFailure(500) }, 3],
        ];
        for (const [replies, expectedCalls] of cases) {
            const { response, calls } = await executeSellerFunction(
                functionId,
                sellerPostRequest(functionId, { orderId: "42" }),
                sellerResponder(replies),
            );
            await expectGenericFailure(response);
            expect(calls).toHaveLength(expectedCalls);
        }
    });

    test("redacts malformed response shapes at every boundary", async () => {
        const invalidJson = new Response("{", {
            headers: { "content-type": "application/json" },
        });
        const cases: Array<[SellerReplies, number]> = [
            [{ sale: {} }, 1],
            [{ sale: { publicId: 42 } }, 1],
            [{ sale: invalidJson }, 1],
            [{ authorization: { ...labelAuthorization, allowed: "yes" } }, 2],
            [{ capability: { token: 42, expiresAt: "later" } }, 3],
        ];
        for (const [replies, expectedCalls] of cases) {
            const { response, calls } = await executeSellerFunction(
                functionId,
                sellerPostRequest(functionId, { orderId: "42" }),
                sellerResponder(replies),
            );
            await expectGenericFailure(response);
            expect(calls).toHaveLength(expectedCalls);
        }

        const denied = await executeSellerFunction(
            functionId,
            sellerPostRequest(functionId, { orderId: "42" }),
            sellerResponder({ authorization: {} }),
        );
        expect(denied.response.status).toBe(409);
        expect(await denied.response.json()).toEqual({
            error: "Commerce has not authorized label access",
        });
        expect(denied.calls).toHaveLength(2);

        const incompleteCapabilities: Array<[unknown, unknown]> = [
            [{}, { labelUrl: "/.cms/sources/delivery/label?token=" }],
            [{ token: "x" }, { labelUrl: "/.cms/sources/delivery/label?token=x" }],
            [{ expiresAt: "later" }, {
                labelUrl: "/.cms/sources/delivery/label?token=",
                expiresAt: "later",
            }],
        ];
        for (const [capability, body] of incompleteCapabilities) {
            const result = await executeSellerFunction(
                functionId,
                sellerPostRequest(functionId, { orderId: "42" }),
                sellerResponder({ capability }),
            );
            expect(result.response.status).toBe(200);
            expect(await result.response.json()).toEqual(body);
            expect(result.calls).toHaveLength(3);
        }
    });
});
