import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
    supabaseUrl,
} from "../../../harness";

installCommerceTestEnvironment();

const route = "/admin/protected-payment";
const operationColumns = [
    "order_id",
    "order_public_id",
    "order_number",
    "buyer_cms_user_id",
    "seller_id",
    "currency",
    "buyer_total_amount",
    "seller_proceeds_amount",
    "platform_retained_amount",
    "financial_terms_hash",
    "payment_status",
    "fulfillment_status",
    "settlement_status",
    "claim_status",
    "total_refund_requested_amount",
    "recipient_handoff_at",
    "recipient_handoff_first_observed_at",
    "claim_window_started_at",
    "claim_by_at",
    "release_eligible_at",
    "updated_at",
];

describe("commerce protected-payment entry contract", () => {
    test("rejects invalid CMS authentication and non-admin roles before PostgREST", async () => {
        for (const options of [
            { authenticated: false, userRole: "admin" },
            { authorization: "Bearer invalid-commerce-key", userRole: "admin" },
        ]) {
            const response = await requestCommerce(`${route}?orderId=42`, options);
            expect({ status: response.status, body: await response.json() }).toEqual({
                status: 401,
                body: { error: "invalid CMS API key" },
            });
        }

        for (const userRole of [null, "user", "support", "finance"]) {
            const response = await requestCommerce(`${route}?orderId=42`, { userRole });
            expect({ userRole, status: response.status, body: await response.json() }).toEqual({
                userRole,
                status: 403,
                body: { error: "CMS admin role is required" },
            });
        }
        expect(capturedFetches()).toHaveLength(0);
    });

    test("validates selectors before PostgREST and gives orderId parsing priority", async () => {
        for (const [path, error] of [
            [route, "orderId or publicId is required"],
            [`${route}?publicId=%20%20`, "orderId or publicId is required"],
            [`${route}?orderId=invalid&publicId=order-public-id`, "orderId must be an integer"],
        ] as const) {
            const response = await requestCommerce(path);
            expect({ path, status: response.status, body: await response.json() }).toEqual({
                path,
                status: 400,
                body: { error },
            });
        }
        expect(capturedFetches()).toHaveLength(0);
    });

    test("returns the same 404 after one exact operation lookup for either selector", async () => {
        setRestResponder(() => jsonResponse([]));

        for (const [query, filter, value] of [
            ["orderId=42", "order_id", "eq.42"],
            ["publicId=%20order-public-id%20", "order_public_id", "eq.order-public-id"],
            ["orderId=42&publicId=ignored", "order_id", "eq.42"],
        ] as const) {
            const before = capturedFetches().length;
            const response = await requestCommerce(`${route}?${query}`);

            expect({ status: response.status, body: await response.json() }).toEqual({
                status: 404,
                body: { error: "protected payment not found" },
            });
            const calls = capturedFetches().slice(before);
            expect(calls).toHaveLength(1);
            expectOperationLookup(calls[0]!.url, filter, value);
        }
        expect(capturedFetches()).toHaveLength(3);
    });

    test("maps operation lookup failures after exactly one database request", async () => {
        for (const [upstreamStatus, expectedStatus, message] of [
            [400, 422, "invalid input syntax for type uuid: invalid"],
            [503, 502, "protected operations unavailable"],
        ] as const) {
            setRestResponder(() => jsonResponse({ message }, upstreamStatus));
            const before = capturedFetches().length;
            const response = await requestCommerce(`${route}?publicId=invalid`);

            expect({ status: response.status, body: await response.json() }).toEqual({
                status: expectedStatus,
                body: { error: message },
            });
            const calls = capturedFetches().slice(before);
            expect(calls).toHaveLength(1);
            expectOperationLookup(calls[0]!.url, "order_public_id", "eq.invalid");
        }
    });

    test("orders Stripe dispute projections by their real opening timestamp", async () => {
        setRestResponder((request) => {
            const resource = new URL(request.url).pathname.split("/").at(-1);
            if (resource === "protected_order_operations") {
                return jsonResponse([
                    {
                        order_id: 42,
                        order_public_id: "00000000-0000-4000-8000-000000000042",
                        updated_at: "2026-07-23T12:00:00.000Z",
                    },
                ]);
            }
            return jsonResponse([]);
        });

        const response = await requestCommerce(`${route}?orderId=42`);

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ orderId: 42, stripeDisputes: [] });
        const disputeCalls = capturedFetches().filter(
            (call) => new URL(call.url).pathname.split("/").at(-1) === "stripe_dispute_projections",
        );
        expect(disputeCalls).toHaveLength(1);
        const disputeUrl = new URL(disputeCalls[0]!.url);
        expect(disputeUrl.searchParams.get("select")).toBe("*");
        expect(disputeUrl.searchParams.get("order_id")).toBe("eq.42");
        expect(disputeUrl.searchParams.get("order")).toBe("opened_at.desc,id.desc");
        expect([...disputeUrl.searchParams.keys()].sort()).toEqual(["order", "order_id", "select"]);
    });
});

function expectOperationLookup(urlValue: string, filter: string, value: string): void {
    const url = new URL(urlValue);
    expect(`${url.origin}${url.pathname}`).toBe(`${supabaseUrl}/rest/v1/protected_order_operations`);
    expect(url.searchParams.get("select")).toBe(operationColumns.join(","));
    expect(url.searchParams.get("limit")).toBe("1");
    expect(url.searchParams.get(filter)).toBe(value);
    expect([...url.searchParams.keys()].sort()).toEqual([filter, "limit", "select"].sort());
}
