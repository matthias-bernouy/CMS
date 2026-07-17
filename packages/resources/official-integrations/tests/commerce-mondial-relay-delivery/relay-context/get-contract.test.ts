import { describe, expect, test } from "bun:test";
import {
    buyerId,
    orderPublicId,
    publicRelayPoint,
    savedQuoteId,
} from "./fixtures";
import {
    executeRelay,
    expectGenericFailure,
} from "./harness";
import {
    selectorResponder,
    successfulGetResponder,
} from "./responders";

describe("getRelayPointForOrder contract", () => {
    test("returns the exact public projection through two fresh GET calls", async () => {
        const first = await executeRelay(
            "getRelayPointForOrder",
            successfulGetResponder(),
        );
        const second = await executeRelay(
            "getRelayPointForOrder",
            successfulGetResponder(),
        );

        expect(first.response.status).toBe(200);
        const body = await first.response.json();
        expect(body).toEqual(publicRelayPoint);
        expect(Object.keys(body)).toEqual(Object.keys(publicRelayPoint));
        expect(JSON.stringify(body)).not.toContain("Private Street");
        expect(JSON.stringify(body)).not.toContain("provider");
        expect(JSON.stringify(body)).not.toContain("must not cross");
        expect(first.calls.map(call => [
            call.method,
            call.url.pathname,
            Object.fromEntries(call.url.searchParams),
        ])).toEqual([
            ["GET", "/order", { id: "42" }],
            ["GET", "/public", {
                quoteId: savedQuoteId,
                externalOrderId: orderPublicId,
                selectedForCmsUserId: buyerId,
            }],
        ]);
        expect(second.calls.map(call => call.url.pathname)).toEqual([
            "/order",
            "/public",
        ]);
        expect(second.response.status).toBe(200);
        expect(await second.response.json()).toEqual(body);
        expect(second.calls.map(call => call.userId)).toEqual([
            buyerId,
            null,
        ]);
    });

    test("keeps missing fields omitted but rejects explicit nulls", async () => {
        const missing = await executeRelay(
            "getRelayPointForOrder",
            successfulGetResponder({
                publicQuote: { addressLine2: undefined },
            }),
        );
        const nullable = await executeRelay(
            "getRelayPointForOrder",
            successfulGetResponder({
                publicQuote: { addressLine2: null },
            }),
        );

        expect(missing.response.status).toBe(200);
        const missingBody = await missing.response.json();
        expect(missingBody).toEqual({
            ...publicRelayPoint,
            addressLine2: undefined,
        });
        expect(Object.hasOwn(missingBody, "addressLine2")).toBe(false);
        await expectGenericFailure(nullable.response);
    });

    test("keeps the defensive buyer refusal before Delivery", async () => {
        const result = await executeRelay(
            "getRelayPointForOrder",
            successfulGetResponder({
                order: { buyerCmsUserId: "another-buyer" },
            }),
        );
        const withoutTerms = await executeRelay(
            "getRelayPointForOrder",
            successfulGetResponder({
                order: {
                    buyerCmsUserId: "another-buyer",
                    financialTerms: null,
                },
            }),
        );

        expect(result.response.status).toBe(403);
        expect(await result.response.json()).toEqual({
            error: "Order does not belong to the current buyer",
        });
        expect(paths(result.calls)).toEqual(["/order"]);
        expect(withoutTerms.response.status).toBe(403);
        expect(await withoutTerms.response.json()).toEqual({
            error: "Order does not belong to the current buyer",
        });
        expect(paths(withoutTerms.calls)).toEqual(["/order"]);
    });

    test("preserves selector failures as generic upstream failures", async () => {
        for (const suffix of [
            "",
            "?orderId=",
            "?orderId=invalid",
            "?orderId=7.5",
            "?orderId=-1",
            "?orderId=9007199254740992",
        ]) {
            const requestUrl =
                `https://cms.test/functions/getRelayPointForOrder${suffix}`;
            const result = await executeRelay(
                "getRelayPointForOrder",
                selectorResponder,
                {
                    request: new Request(requestUrl),
                },
            );

            await expectGenericFailure(result.response);
            expect(paths(result.calls)).toEqual(["/order"]);
            expect(result.calls[0]?.url.searchParams.get("id")).toBe(
                new URL(requestUrl).searchParams.get("orderId") || null,
            );
        }
    });

    test("does no Delivery fetch without immutable financial terms", async () => {
        for (const orderOverride of [
            { financialTerms: null },
            { financialTerms: {} },
        ]) {
            const result = await executeRelay(
                "getRelayPointForOrder",
                successfulGetResponder({ order: orderOverride }),
            );

            await expectGenericFailure(result.response);
            expect(paths(result.calls)).toEqual(["/order"]);
        }
    });

    test("stops at Commerce or Delivery and redacts upstream details", async () => {
        const commerce = await executeRelay(
            "getRelayPointForOrder",
            successfulGetResponder({ failAt: "order" }),
        );
        const delivery = await executeRelay(
            "getRelayPointForOrder",
            successfulGetResponder({ failAt: "public" }),
        );

        await expectGenericFailure(commerce.response);
        expect(paths(commerce.calls)).toEqual(["/order"]);
        await expectGenericFailure(delivery.response);
        expect(paths(delivery.calls)).toEqual(["/order", "/public"]);
    });
});

function paths(calls: Array<{ url: URL }>): string[] {
    return calls.map(call => call.url.pathname);
}
