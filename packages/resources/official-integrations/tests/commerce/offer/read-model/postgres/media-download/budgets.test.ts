import { describe, expect, test } from "bun:test";
import { installCommerceTestEnvironment, requestCommerce } from "../../../../harness";
import {
    callKinds,
    callsSince,
    expectSingleDownloadContextRpc,
    expectedStorageSignature,
    fetchCount,
    storageSignature,
    type OfferImageScope,
} from "./assertions";
import { offerImageBytes, offerImageMediaId, useOfferImageResponder } from "./fixtures";

installCommerceTestEnvironment();

describe("commerce offer image download call budgets", () => {
    test("reduces public, self, and admin access to one database RPC before the same Storage GET", async () => {
        const scenarios: Array<{
            scope: OfferImageScope;
            route: string;
            userId?: string;
            expectedKinds: string[];
        }> = [
            {
                scope: "public",
                route: "/offer/image",
                expectedKinds: ["rpc:get_offer_media_download_context", "storage:GET"],
            },
            {
                scope: "self",
                route: "/me/offer/image",
                userId: "seller-user-123",
                expectedKinds: ["rpc:get_offer_media_download_context", "storage:GET"],
            },
            {
                scope: "admin",
                route: "/admin/offer/image",
                expectedKinds: ["rpc:get_offer_media_download_context", "storage:GET"],
            },
        ];
        const storageCalls: Array<Record<string, unknown>> = [];

        for (const scenario of scenarios) {
            useOfferImageResponder();
            const before = fetchCount();
            const response = await requestCommerce(`${scenario.route}?id=${offerImageMediaId}`, {
                userId: scenario.userId,
                userRole: scenario.scope === "admin" ? null : undefined,
            });
            const calls = callsSince(before);

            expect(response.status).toBe(200);
            expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual(Array.from(offerImageBytes));
            expect(callKinds(calls)).toEqual(scenario.expectedKinds);
            expectSingleDownloadContextRpc(scenario.scope, calls);
            storageCalls.push(storageSignature(calls));
        }

        expect(storageCalls).toEqual([
            expectedStorageSignature(),
            expectedStorageSignature(),
            expectedStorageSignature(),
        ]);
    });

    test("keeps administrator media access independent from offer visibility and ownership", async () => {
        useOfferImageResponder({
            offerMedia: null,
            offer: { publication_status: "draft", seller_id: 999 },
            seller: { verification_status: "suspended", cms_user_id: "another-user" },
        });

        const response = await requestCommerce(`/admin/offer/image?id=${offerImageMediaId}`, {
            userRole: null,
        });
        const calls = callsSince(0);

        expect(response.status).toBe(200);
        expect(callKinds(calls)).toEqual(["rpc:get_offer_media_download_context", "storage:GET"]);
        expectSingleDownloadContextRpc("admin", calls);
    });
});
