import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../harness";
import { adminOfferDetail, nullOfferDetail, sellerOfferDetail } from "./expected";
import { offerRow, resourceName, useFullOfferDetailResponder } from "./fixtures";

installCommerceTestEnvironment();

describe("commerce offer detail selector and administrator contracts", () => {
    test("supports a seller slug and gives a valid id precedence over a different slug", async () => {
        useFullOfferDetailResponder();

        const seller = await requestCommerce("/me/offer?slug=camera-offer", {
            userId: "seller-user-123",
        });
        const admin = await requestCommerce("/admin/offer?id=91&slug=wrong", { userRole: null });

        expect(seller.status).toBe(200);
        expect(await seller.json()).toEqual(sellerOfferDetail);
        expect(admin.status).toBe(200);
        expect(await admin.json()).toEqual(adminOfferDetail);
    });

    test("rejects an invalid id even when a valid slug is supplied", async () => {
        const response = await requestCommerce("/admin/offer?id=invalid&slug=camera-offer", {
            userRole: null,
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "id must be an integer" });
        expect(capturedFetches()).toEqual([]);
    });

    test("returns the administrator missing-offer contract", async () => {
        setRestResponder(() => jsonResponse([]));

        const response = await requestCommerce("/admin/offer?id=404", { userRole: null });

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "offer not found" });
    });

    test("preserves administrator null projections and empty collections", async () => {
        setRestResponder(request => {
            const resource = resourceName(request);
            if (resource === "offers") return jsonResponse([{ ...offerRow, variant_id: null }]);
            if (["sellers", "products", "offer_price_rules"].includes(resource)) return jsonResponse([]);
            if (["offer_price_proposals", "offer_media"].includes(resource)) return jsonResponse([]);
            throw new Error(`Unexpected administrator null request: ${request.url}`);
        });

        const response = await requestCommerce("/admin/offer?id=91", { userRole: null });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(nullOfferDetail);
    });

    test("uses the first ordered media item for administrators when none is main", async () => {
        useFullOfferDetailResponder({ mainMedia: false });

        const response = await requestCommerce("/admin/offer?id=91", { userRole: null });
        const body = await response.json() as Record<string, unknown>;

        expect(response.status).toBe(200);
        expect(body.mainImageMediaId).toBe("201");
        expect((body.media as Array<Record<string, unknown>>).map(item => item.mediaId))
            .toEqual([201, 202]);
    });
});
