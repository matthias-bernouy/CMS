import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    expectRpc,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../harness";
import { pngBytes } from "./fixtures";

installCommerceTestEnvironment();

describe("Commerce detached image access", () => {
    test("fails closed before Storage for detached offer media in public, seller, and admin scopes", async () => {
        setRestResponder(() => jsonResponse({ state: "not_found" }));

        const publicResponse = await requestCommerce("/offer/image?id=17");
        const sellerResponse = await requestCommerce("/me/offer/image?id=17", {
            userId: "seller-7",
        });
        const adminResponse = await requestCommerce("/admin/offer/image?id=17");

        expect([publicResponse.status, sellerResponse.status, adminResponse.status]).toEqual([404, 404, 404]);
        expect(capturedFetches().map(callKind)).toEqual([
            "get_offer_media_download_context",
            "get_offer_media_download_context",
            "get_offer_media_download_context",
        ]);
        const sellerContext = capturedFetches()[1]!;
        expect(sellerContext.body).toMatchObject({
            p_scope: "self",
            p_media_id: 17,
            p_cms_user_id: "seller-7",
        });
    });

    test("fails closed before Storage for a detached product media identity", async () => {
        setRestResponder(() => jsonResponse({ state: "not_found" }));

        const response = await requestCommerce("/admin/product/image?id=21");

        expect(response.status).toBe(404);
        expect(capturedFetches().map(callKind)).toEqual(["get_product_media_download_context"]);
        expect(expectRpc("get_product_media_download_context").body).toEqual({ p_media_id: 21 });
    });

    test("downloads only the path returned by an authorized context", async () => {
        setRestResponder((request) => {
            if (request.url.includes("/storage/v1/object/")) {
                return new Response(pngBytes(), {
                    headers: {
                        "content-type": "image/png",
                        etag: '"original-etag"',
                        "last-modified": "Fri, 24 Jul 2026 10:00:00 GMT",
                    },
                });
            }
            return jsonResponse({
                state: "ok",
                media: {
                    id: 17,
                    storage_bucket: "commerce-media",
                    storage_path: "offers/42/original.png",
                    mime_type: "image/png",
                    width: 320,
                    height: 200,
                },
            });
        });

        const response = await requestCommerce("/offer/image?id=17");

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
        expect(response.headers.get("etag")).toBe('"original-etag"');
        expect(capturedFetches().map(callKind)).toEqual(["get_offer_media_download_context", "storage:GET"]);
    });

    test("requires seller and admin offer images to be reauthorized instead of browser-cached", async () => {
        setRestResponder((request) => {
            if (request.url.includes("/storage/v1/object/")) {
                return new Response(pngBytes(), { headers: { "content-type": "image/png" } });
            }
            return jsonResponse({
                state: "ok",
                media: {
                    id: 17,
                    storage_bucket: "commerce-media",
                    storage_path: "offers/42/original.png",
                    mime_type: "image/png",
                },
            });
        });

        const seller = await requestCommerce("/me/offer/image?id=17", {
            userId: "seller-7",
        });
        const admin = await requestCommerce("/admin/offer/image?id=17");

        expect(seller.headers.get("cache-control")).toBe("private, no-store");
        expect(admin.headers.get("cache-control")).toBe("private, no-store");
    });

    test("never marks an admin product image response as publicly cacheable", async () => {
        setRestResponder((request) => {
            if (request.url.includes("/storage/v1/object/")) {
                return new Response(pngBytes(), { headers: { "content-type": "image/png" } });
            }
            return jsonResponse({
                state: "ok",
                media: {
                    id: 21,
                    storage_bucket: "commerce-media",
                    storage_path: "products/9/original.png",
                    mime_type: "image/png",
                },
            });
        });

        const response = await requestCommerce("/admin/product/image?id=21");

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
    });
});

function callKind(call: { url: string; method: string }): string {
    return call.url.includes("/storage/v1/object/")
        ? `storage:${call.method}`
        : new URL(call.url).pathname.split("/").at(-1)!;
}
