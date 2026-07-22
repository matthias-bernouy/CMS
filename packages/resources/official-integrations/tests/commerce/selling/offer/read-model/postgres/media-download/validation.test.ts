import { describe, expect, test } from "bun:test";
import { installCommerceTestEnvironment, requestCommerce } from "../../../../../harness";
import { callsSince, expectNoStorage, fetchCount } from "./assertions";
import { offerImageMediaId, offerImageMediaRow, useOfferImageResponder } from "./fixtures";

installCommerceTestEnvironment();

describe("commerce offer image request validation", () => {
    test("rejects missing, non-integer, non-positive, and unsafe ids without external work", async () => {
        const scenarios = [
            { query: "", error: "id is required" },
            { query: "?id=not-an-id", error: "id must be an integer" },
            { query: "?id=0", error: "id must be positive" },
            { query: "?id=9007199254740992", error: "id must be an integer" },
        ];

        for (const scenario of scenarios) {
            const response = await requestCommerce(`/offer/image${scenario.query}`);

            expect({ status: response.status, body: await response.json() }).toEqual({
                status: 400,
                body: { error: scenario.error },
            });
        }
        expect(callsSince(0)).toEqual([]);
    });

    test("accepts mediaId as the legacy selector while id has precedence", async () => {
        for (const query of [`?mediaId=${offerImageMediaId}`, `?id=${offerImageMediaId}&mediaId=999`]) {
            useOfferImageResponder();
            const before = fetchCount();
            const response = await requestCommerce(`/admin/offer/image${query}`);
            const calls = callsSince(before);

            expect(response.status).toBe(200);
            expect(requestedMediaId(calls[0]!)).toBe(offerImageMediaId);
        }
    });

    test("returns the exact public method contract without database or Storage work", async () => {
        const response = await requestCommerce(`/offer/image?id=${offerImageMediaId}`, {
            method: "POST",
        });

        expect(response.status).toBe(405);
        expect(response.headers.get("allow")).toBe("GET, OPTIONS");
        expect(await response.text()).toBe("Method Not Allowed");
        expect(callsSince(0)).toEqual([]);
    });

    test("requires self identity only after resolving an existing seller", async () => {
        const scenarios = [
            { options: { offerMedia: null }, status: 404, error: "offer image not found" },
            { options: { offer: null }, status: 404, error: "offer image not found" },
            { options: { seller: null }, status: 404, error: "offer image not found" },
            { options: {}, status: 401, error: "missing CMS user id" },
            { options: { media: null }, status: 401, error: "missing CMS user id" },
            {
                options: { seller: { cms_user_id: "another-user" } },
                status: 401,
                error: "missing CMS user id",
            },
        ];

        for (const scenario of scenarios) {
            useOfferImageResponder(scenario.options);
            const before = fetchCount();
            const response = await requestCommerce(`/me/offer/image?id=${offerImageMediaId}`);
            const calls = callsSince(before);

            expect({ status: response.status, body: await response.json() }).toEqual({
                status: scenario.status,
                body: { error: scenario.error },
            });
            expectNoStorage(calls);
        }
    });

    test("rejects absent or invalid private media coordinates before Storage", async () => {
        const mediaRows = [
            null,
            { ...offerImageMediaRow, storage_bucket: "another-bucket" },
            { ...offerImageMediaRow, storage_path: null },
        ];

        for (const media of mediaRows) {
            useOfferImageResponder({ media });
            const before = fetchCount();
            const response = await requestCommerce(`/admin/offer/image?id=${offerImageMediaId}`);
            const calls = callsSince(before);

            expect({ status: response.status, body: await response.json() }).toEqual({
                status: 404,
                body: { error: "offer image not found" },
            });
            expectNoStorage(calls);
        }
    });
});

function requestedMediaId(call: { url: string; body: unknown }): number {
    const url = new URL(call.url);
    if (url.pathname.includes("/rpc/")) {
        return Number((call.body as Record<string, unknown>).p_media_id);
    }
    return Number(url.searchParams.get("id")?.replace(/^eq\./, ""));
}
