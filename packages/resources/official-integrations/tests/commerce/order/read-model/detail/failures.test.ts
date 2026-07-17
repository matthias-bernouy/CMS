import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../../harness";
import { buyerId, sellerUserId } from "../fixtures/raw";
import { completeDetailEnvelope } from "../fixtures/responder";

installCommerceTestEnvironment();

describe("commerce order and sale detail failures", () => {
    test("preserves seller lookup and hydration failure messages", async () => {
        for (const message of ["seller lookup unavailable", "sale lookup unavailable"]) {
            setRestResponder(() => jsonResponse({ message }, 503));
            const before = capturedFetches().length;

            const response = await requestCommerce("/me/sale?id=42", {
                userId: sellerUserId,
            });

            expect({ status: response.status, body: await response.json() }).toEqual({
                status: 502, body: { error: message },
            });
            expect(capturedFetches().slice(before)).toHaveLength(1);
        }
    });

    test("preserves actor-specific hydration failure messages", async () => {
        const cases = [
            ["/me/order?id=42", { userId: buyerId }, "metadata definitions unavailable"],
            ["/me/sale?id=42", { userId: sellerUserId }, "authorization unavailable"],
            ["/admin/order?id=42", {}, "claim lookup unavailable"],
        ] as const;
        for (const [route, options, message] of cases) {
            setRestResponder(() => jsonResponse({ message }, 503));

            const response = await requestCommerce(route, options);

            expect({ route, status: response.status, body: await response.json() }).toEqual({
                route, status: 502, body: { error: message },
            });
        }
    });

    test("fails closed on malformed private detail envelopes", async () => {
        const buyer = completeDetailEnvelope("buyer");
        const seller = completeDetailEnvelope("seller");
        const admin = completeDetailEnvelope("admin");
        const cases = [
            ["/me/order?id=42", { userId: buyerId }, null],
            ["/me/order?id=42", { userId: buyerId }, { state: "unknown" }],
            ["/me/order?id=42", { userId: buyerId }, { ...buyer, lines: [null] }],
            ["/me/order?id=42", { userId: buyerId }, { ...buyer, authorization: {} }],
            ["/me/order?id=42", { userId: buyerId }, { state: "identity_required" }],
            ["/me/sale?id=42", { userId: sellerUserId }, { ...seller, seller: {} }],
            ["/admin/order?id=42", {}, { ...admin, definitions: [{}] }],
            ["/admin/order?id=42", {}, { state: "identity_required" }],
        ] as const;
        for (const [route, options, value] of cases) {
            setRestResponder(() => jsonResponse(value));
            const before = capturedFetches().length;

            const response = await requestCommerce(route, options);

            expect({ route, status: response.status, body: await response.json() }).toEqual({
                route,
                status: 502,
                body: { error: "get_order_detail_read_model returned an invalid response" },
            });
            expect(capturedFetches().slice(before)).toHaveLength(1);
        }
    });
});
