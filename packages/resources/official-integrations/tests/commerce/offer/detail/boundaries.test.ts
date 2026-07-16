import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../harness";
import { newOfferTemplate, nullOfferDetail } from "./expected";
import { offerRow, resourceName } from "./fixtures";

installCommerceTestEnvironment();

describe("commerce offer detail boundaries", () => {
    test("returns the same local new-offer template without user identity or database work", async () => {
        const seller = await requestCommerce("/me/offer?id=__new__");
        const admin = await requestCommerce("/admin/offer?id=__new__", { userRole: null });

        expect({ seller: seller.status, admin: admin.status }).toEqual({ seller: 200, admin: 200 });
        expect(await seller.json()).toEqual(newOfferTemplate);
        expect(await admin.json()).toEqual(newOfferTemplate);
        expect(capturedFetches()).toEqual([]);
    });

    test("rejects missing and invalid selectors before database or identity work", async () => {
        const missing = await requestCommerce("/me/offer");
        const invalid = await requestCommerce("/admin/offer?id=invalid", { userRole: null });

        expect(missing.status).toBe(400);
        expect(await missing.json()).toEqual({ error: "id or slug is required" });
        expect(invalid.status).toBe(400);
        expect(await invalid.json()).toEqual({ error: "id must be an integer" });
        expect(capturedFetches()).toEqual([]);
    });

    test("returns the missing self offer before requiring a CMS user", async () => {
        setRestResponder(() => jsonResponse([]));

        const response = await requestCommerce("/me/offer?id=404");

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "offer not found" });
    });

    test("rejects an invalid CMS key before reading an administrator offer", async () => {
        const response = await requestCommerce("/admin/offer?id=91", {
            authenticated: false,
            userRole: null,
        });

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "invalid CMS API key" });
        expect(capturedFetches()).toEqual([]);
    });

    test("returns 404 when the offer seller disappeared without requiring a user header", async () => {
        setRestResponder(request => {
            const resource = resourceName(request);
            if (resource === "offers") return jsonResponse([offerRow]);
            if (resource === "sellers") return jsonResponse([]);
            throw new Error(`Unexpected missing-owner request: ${request.url}`);
        });

        const response = await requestCommerce("/me/offer?id=91");

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "offer not found" });
    });

    test("hides another seller offer before running any enrichment read", async () => {
        setRestResponder(request => {
            const resource = resourceName(request);
            if (resource === "offers") return jsonResponse([offerRow]);
            if (resource === "sellers") return jsonResponse([{ cms_user_id: "other-user" }]);
            throw new Error(`Unexpected ownership request: ${request.url}`);
        });

        const response = await requestCommerce("/me/offer?id=91", {
            userId: "seller-user-123",
        });

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "offer not found" });
    });

    test("requires the CMS user only after loading an existing offer owner", async () => {
        setRestResponder(request => {
            const resource = resourceName(request);
            if (resource === "offers") return jsonResponse([offerRow]);
            if (resource === "sellers") return jsonResponse([{ cms_user_id: "seller-user-123" }]);
            throw new Error(`Unexpected identity request: ${request.url}`);
        });

        const response = await requestCommerce("/me/offer?id=91");

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "missing CMS user id" });
    });

    test("preserves null related projections and skips their dependent reads", async () => {
        const row = { ...offerRow, variant_id: null };
        setRestResponder(request => {
            const url = new URL(request.url);
            const resource = resourceName(request);
            if (resource === "offers") return jsonResponse([row]);
            if (resource === "sellers" && url.searchParams.get("select") === "cms_user_id") {
                return jsonResponse([{ cms_user_id: "seller-user-123" }]);
            }
            if (["sellers", "products", "offer_price_rules"].includes(resource)) return jsonResponse([]);
            if (["offer_price_proposals", "offer_media"].includes(resource)) return jsonResponse([]);
            throw new Error(`Unexpected null projection request: ${request.url}`);
        });

        const response = await requestCommerce("/me/offer?id=91", {
            userId: "seller-user-123",
        });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual(nullOfferDetail);
    });
});
