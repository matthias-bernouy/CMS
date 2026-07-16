import { describe, expect, test } from "bun:test";
import {
    installCommerceTestEnvironment,
    requestCommerce,
} from "../../harness";
import { adminOfferDetail, sellerOfferDetail } from "./expected";
import { useFullOfferDetailResponder } from "./fixtures";

installCommerceTestEnvironment();

describe("commerce offer detail contracts", () => {
    test("preserves the complete seller projection, nulls, metadata, and collection order", async () => {
        useFullOfferDetailResponder();

        const response = await requestCommerce("/me/offer?id=91", {
            userId: "seller-user-123",
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(sellerOfferDetail);
    });

    test("preserves the complete administrator projection when only the CMS key is present", async () => {
        useFullOfferDetailResponder();

        const response = await requestCommerce("/admin/offer?slug=camera-offer", {
            userRole: null,
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(adminOfferDetail);
    });

    test("uses the first ordered media item when no image is explicitly main", async () => {
        useFullOfferDetailResponder({ mainMedia: false });

        const response = await requestCommerce("/me/offer?id=91", {
            userId: "seller-user-123",
        });
        const body = await response.json() as Record<string, unknown>;

        expect(response.status).toBe(200);
        expect(body.mainImageMediaId).toBe("201");
        expect((body.media as Array<Record<string, unknown>>).map(item => item.mediaId))
            .toEqual([201, 202]);
    });
});
