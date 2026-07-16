import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../harness";

installCommerceTestEnvironment();

const cases: Array<{
    label: string;
    status: string;
}> = [
    { label: "all", status: "all" },
    { label: "paused", status: "paused" },
    { label: "archived", status: "archived" },
    { label: "rejected", status: "rejected" },
    { label: "action required", status: "action_required" },
    { label: "draft", status: "draft" },
];
const sellerReadModelRpc = "list_seller_offers_read_model";

describe("commerce seller offer status mapping", () => {
    test.each(cases)("delegates $label to the seller read-model RPC", async scenario => {
        useResponder();

        const response = await requestCommerce(`/me/offers?status=${scenario.status}`, {
            userId: "seller-user-123",
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ items: [], total: 0, limit: 50, offset: 0 });
        expect(resources()).toEqual([sellerReadModelRpc]);
        expect(rpcBody()).toEqual({
            p_cms_user_id: "seller-user-123",
            p_status: scenario.status,
            p_limit: 50,
            p_offset: 0,
        });
    });
});

function useResponder(): void {
    setRestResponder(request => {
        const resource = resourceName(request);
        if (resource === sellerReadModelRpc) return jsonResponse({
            seller_exists: true,
            status_valid: true,
            rows: [],
            total: 0,
            workflow_states: [],
            media: [],
            active_price_proposals: [],
        });
        throw new Error(`Unexpected seller offer request: ${request.url}`);
    });
}

function rpcBody(): Record<string, unknown> {
    expect(capturedFetches()).toHaveLength(1);
    return capturedFetches()[0]!.body;
}

function resources(): string[] {
    return capturedFetches().map(call => resourceName(call));
}

function resourceName(request: Request | { url: string }): string {
    return new URL(request.url).pathname.split("/").at(-1)!;
}
