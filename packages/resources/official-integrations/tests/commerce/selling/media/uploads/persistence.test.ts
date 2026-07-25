import { describe, expect, test } from "bun:test";
import { capturedFetches, expectRpc, installCommerceTestEnvironment, requestCommerce } from "../../../harness";
import { imageForm, pngBytes } from "../fixtures";
import { callKind, objectPath, storageCalls, useMediaResponder } from "./uploadHarness";

installCommerceTestEnvironment();

describe("Commerce image upload persistence", () => {
    test("preauthorizes, detects, uploads, then performs the authoritative offer attach recheck", async () => {
        useMediaResponder();

        const response = await requestCommerce("/me/offer/image?offerId=42", {
            userId: "seller-7",
            formData: imageForm(pngBytes(640, 360), {
                filename: "racket.jpeg",
                type: "image/jpeg",
            }),
        });
        const calls = capturedFetches();
        const preauthorization = expectRpc("authorize_offer_media_upload");
        const attach = expectRpc("attach_offer_media_v2");
        const storage = calls.find((call) => callKind(call) === "storage:POST")!;

        expect(response.status).toBe(200);
        expect(calls.map(callKind)).toEqual(["authorize_offer_media_upload", "storage:POST", "attach_offer_media_v2"]);
        expect(preauthorization.body).toEqual({
            p_offer_id: 42,
            p_replace_media_id: null,
            p_cms_user_id: "seller-7",
        });
        expect(storage.url).toMatch(/\/commerce-media\/offers\/42\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]+\.png$/);
        expect(storage.headers.get("content-type")).toBe("image/png");
        expect(storage.headers.get("x-upsert")).toBe("false");
        expect(attach.body).toMatchObject({
            p_offer_id: 42,
            p_mime_type: "image/png",
            p_file_size: pngBytes(640, 360).byteLength,
            p_original_filename: "racket.jpeg",
            p_width: 640,
            p_height: 360,
            p_replace_media_id: null,
            p_cms_user_id: "seller-7",
        });
        expect(attach.body.p_storage_path).toBe(objectPath(storage.url));
    });

    test("validates replacement before reading and retains the previous original", async () => {
        useMediaResponder();

        const response = await requestCommerce("/admin/product/image/replace?productId=9&mediaId=17", {
            formData: imageForm(pngBytes(800, 600)),
        });
        const calls = capturedFetches();

        expect(response.status).toBe(200);
        expect(calls.map(callKind)).toEqual([
            "authorize_product_media_upload",
            "storage:POST",
            "attach_product_media_v2",
        ]);
        expect(expectRpc("authorize_product_media_upload").body).toEqual({
            p_product_id: 9,
            p_replace_media_id: 17,
        });
        expect(expectRpc("attach_product_media_v2").body).toMatchObject({
            p_width: 800,
            p_height: 600,
            p_replace_media_id: 17,
        });
        expect(calls.some((call) => callKind(call) === "storage:DELETE")).toBeFalse();
    });

    test("remove RPCs retain Storage objects for old Edge-compatible responses", async () => {
        useMediaResponder();

        const offer = await requestCommerce("/me/offer/image?offerId=42&mediaId=17", {
            method: "DELETE",
            userId: "seller-7",
        });
        expect(offer.status).toBe(200);
        expect(capturedFetches().map(callKind)).toEqual(["remove_offer_media"]);

        useMediaResponder();
        const product = await requestCommerce("/admin/product/image?productId=9&mediaId=18", {
            method: "DELETE",
        });
        expect(product.status).toBe(200);
        expect(capturedFetches().map(callKind)).toEqual(["remove_offer_media", "remove_product_media"]);
        expect(storageCalls()).toHaveLength(0);
    });
});
