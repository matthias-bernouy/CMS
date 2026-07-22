import { describe, expect, test } from "bun:test";
import { installCommerceTestEnvironment, requestCommerce } from "../../../../../harness";
import { callsSince, fetchCount } from "./assertions";
import {
    offerImageBytes,
    offerImageMediaId,
    offerImageMediaRow,
    offerImagePath,
    useOfferImageResponder,
} from "./fixtures";

installCommerceTestEnvironment();

describe("commerce offer image file responses", () => {
    test("streams exact bytes and only the selected public MIME, cache, validators, and CORS headers", async () => {
        useOfferImageResponder();

        const response = await requestCommerce(`/offer/image?id=${offerImageMediaId}`);
        const bytes = new Uint8Array(await response.arrayBuffer());

        expect(response.status).toBe(200);
        expect(Array.from(bytes)).toEqual(Array.from(offerImageBytes));
        expect(Object.fromEntries(response.headers)).toEqual({
            "access-control-allow-headers": "authorization, content-type, x-cms-user-id",
            "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
            "access-control-allow-origin": "*",
            "cache-control": "public, max-age=3600",
            "content-type": "image/webp",
            etag: 'W/"offer-image-12"',
            "last-modified": "Tue, 21 Jul 2026 10:30:00 GMT",
        });

        const serializedResponse = JSON.stringify({
            headers: Object.fromEntries(response.headers),
            bytes: Array.from(bytes),
        });
        for (const privateValue of [
            "sb_secret_test",
            "storage-secret-must-not-leak",
            "row-secret-must-not-leak",
            "commerce-media",
            offerImagePath,
            "storageBucket",
            "storagePath",
            "storage_bucket",
            "storage_path",
            "serviceRoleKey",
            "service_role_key",
        ]) {
            expect(serializedResponse).not.toContain(privateValue);
        }
        for (const privateHeader of ["apikey", "authorization", "x-storage-bucket", "x-storage-path"] as const) {
            expect(response.headers.get(privateHeader)).toBeNull();
        }
    });

    test("uses database MIME fallback and private caching for self and administrator files", async () => {
        const routes = [
            { path: "/me/offer/image", userId: "seller-user-123" },
            { path: "/admin/offer/image", userId: undefined },
        ];

        for (const route of routes) {
            useOfferImageResponder({
                media: { ...offerImageMediaRow, mime_type: "image/avif" },
                storage: { headers: { etag: '"fallback-mime"' } },
            });
            const before = fetchCount();
            const response = await requestCommerce(`${route.path}?id=${offerImageMediaId}`, {
                userId: route.userId,
            });
            const calls = callsSince(before);

            expect(response.status).toBe(200);
            expect(response.headers.get("content-type")).toBe("image/avif");
            expect(response.headers.get("cache-control")).toBe("private, max-age=3600");
            expect(response.headers.get("etag")).toBe('"fallback-mime"');
            expect(response.headers.get("last-modified")).toBeNull();
            expect(calls.filter((call) => call.url.includes("/storage/v1/object/"))).toHaveLength(1);
        }
    });

    test("falls back to application/octet-stream when neither Storage nor media supplies MIME", async () => {
        useOfferImageResponder({
            media: { ...offerImageMediaRow, mime_type: null },
            storage: { headers: {} },
        });

        const response = await requestCommerce(`/admin/offer/image?id=${offerImageMediaId}`);

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("application/octet-stream");
    });

    test("preserves historical Storage 404 wording and maps other Storage failures to 502", async () => {
        const scenarios = [
            { status: 404, message: "object absent", expectedStatus: 404, error: "product image not found" },
            { status: 503, message: "storage unavailable", expectedStatus: 502, error: "storage unavailable" },
        ];

        for (const scenario of scenarios) {
            useOfferImageResponder({ storage: scenario });
            const before = fetchCount();
            const response = await requestCommerce(`/admin/offer/image?id=${offerImageMediaId}`);
            const calls = callsSince(before);

            expect({ status: response.status, body: await response.json() }).toEqual({
                status: scenario.expectedStatus,
                body: { error: scenario.error },
            });
            expect(calls.filter((call) => call.url.includes("/storage/v1/object/"))).toHaveLength(1);
        }
    });
});
