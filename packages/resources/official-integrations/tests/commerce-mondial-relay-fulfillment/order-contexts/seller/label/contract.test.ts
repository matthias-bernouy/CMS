import { describe, expect, test } from "bun:test";
import { loadFulfillmentFunction } from "../../shared/harness";
import { labelAuthorization, labelCapability, orderPublicId, sellerId } from "../shared/fixtures";
import { executeSellerFunction, sellerPostRequest } from "../shared/harness";
import { sellerResponder } from "../shared/responders";

const functionId = "requestShipmentLabelForMySale";

describe("seller shipment label contract", () => {
    test("stays an authenticated POST with the current input contract", async () => {
        const fn = await loadFulfillmentFunction(functionId);

        expect(fn.method).toBe("POST");
        expect(fn.access).toEqual({ mode: "auth" });
        expect(fn.input).toEqual({
            body: {
                type: "object",
                properties: { orderId: { type: "string" } },
                required: ["orderId"],
            },
        });
        expect(fn.output).toEqual([
            {
                status: "200",
                body: { type: "object" },
            },
        ]);
    });

    test("returns only the same-origin capability and preserves call order", async () => {
        const capability = {
            ...labelCapability,
            providerUrl: "https://provider.test/private-label.pdf",
            buyerAddress: "7 Private Street",
        };
        const { response, calls } = await executeSellerFunction(
            functionId,
            sellerPostRequest(functionId, { orderId: "42" }),
            sellerResponder({
                authorization: {
                    publicId: orderPublicId,
                    allowed: labelAuthorization.allowed,
                    sellerCmsUserId: sellerId,
                    shippingAddress: {
                        recipient: "Private Buyer",
                        line1: "7 Private Street",
                    },
                    financialTerms: { hash: "private-financial-hash" },
                    providerReference: labelAuthorization.providerReference,
                },
                capability,
            }),
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual({
            labelUrl: `/.cms/sources/delivery/label?token=${labelCapability.token}`,
            expiresAt: labelCapability.expiresAt,
        });
        expect(Object.keys(body as object).sort()).toEqual(["expiresAt", "labelUrl"]);
        const serialized = JSON.stringify(body);
        for (const privateValue of [
            "Private Buyer",
            "7 Private Street",
            "private-financial-hash",
            "12345678",
            sellerId,
            orderPublicId,
            "provider.test",
        ]) {
            expect(serialized).not.toContain(privateValue);
        }

        expect(
            calls.map((call) => ({
                target: `${call.url.pathname}${call.url.search}`,
                method: call.method,
                body: call.body,
                userId: call.userId,
            })),
        ).toEqual([
            {
                target: "/labelSellerContext?orderId=42",
                method: "GET",
                body: undefined,
                userId: sellerId,
            },
            {
                target: "/issueLabelAccess",
                method: "POST",
                body: { externalOrderId: orderPublicId, sellerCmsUserId: sellerId },
                userId: null,
            },
        ]);
    });

    test("mints a fresh capability on every execution", async () => {
        let mintCount = 0;
        const fallback = sellerResponder();
        const responder = (request: Request): Response => {
            if (new URL(request.url).pathname !== "/issueLabelAccess") {
                return fallback(request);
            }
            mintCount++;
            return Response.json(
                {
                    token: `fresh-token-${mintCount}`,
                    expiresAt: `2026-07-21T08:${10 + mintCount}:00.000Z`,
                },
                { status: 201 },
            );
        };

        const executions = [];
        for (const _ of [1, 2]) {
            executions.push(
                await executeSellerFunction(functionId, sellerPostRequest(functionId, { orderId: "42" }), responder),
            );
        }
        const bodies = await Promise.all(executions.map(({ response }) => response.json()));

        expect(mintCount).toBe(2);
        expect(executions.map(({ calls }) => calls.length)).toEqual([2, 2]);
        expect(bodies).toEqual([
            {
                labelUrl: "/.cms/sources/delivery/label?token=fresh-token-1",
                expiresAt: "2026-07-21T08:11:00.000Z",
            },
            {
                labelUrl: "/.cms/sources/delivery/label?token=fresh-token-2",
                expiresAt: "2026-07-21T08:12:00.000Z",
            },
        ]);
    });
});
