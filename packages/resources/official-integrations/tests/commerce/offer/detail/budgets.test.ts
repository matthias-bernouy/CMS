import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    requestCommerce,
} from "../../harness";
import { useFullOfferDetailResponder } from "./fixtures";

installCommerceTestEnvironment();

describe("commerce current offer detail read budgets", () => {
    test("records the eleven seller reads and their exact bounded selectors", async () => {
        useFullOfferDetailResponder();

        const response = await requestCommerce("/me/offer?id=91", {
            userId: "seller-user-123",
        });

        expect(response.status).toBe(200);
        expect(reads()).toEqual([
            read("offers", { select: offerSelect, limit: "1", id: "eq.91" }),
            read("sellers", { select: "cms_user_id", limit: "1", id: "eq.7" }),
            read("sellers", { select: sellerSelect, limit: "1", id: "eq.7" }),
            read("products", { select: productSelect, limit: "1", id: "eq.42" }),
            read("product_variants", { select: variantSelect, limit: "1", id: "eq.51" }),
            read("offer_price_rules", { select: sellerRuleSelect, limit: "1", offer_id: "eq.91" }),
            read("offer_price_proposals", {
                select: sellerProposalSelect, offer_id: "eq.91", order: "created_at.desc", limit: "20",
            }),
            read("offer_media", { offer_id: "eq.91", select: mediaSelect, order: "sort_order.asc,id.asc" }),
            read("brands", { select: brandSelect, limit: "1", id: "eq.77" }),
            read("product_categories", {
                select: categorySelect, product_id: "eq.42", order: "is_primary.desc,position.asc",
            }),
            read("custom_field_definitions", {
                select: "key", entity_type: "eq.product", public_readable: "eq.true", enabled: "eq.true",
            }),
        ]);
    });

    test("records the nine administrator reads without seller redaction work", async () => {
        useFullOfferDetailResponder();

        const response = await requestCommerce("/admin/offer?id=91", { userRole: null });

        expect(response.status).toBe(200);
        expect(reads()).toEqual([
            read("offers", { select: offerSelect, limit: "1", id: "eq.91" }),
            read("sellers", { select: sellerSelect, limit: "1", id: "eq.7" }),
            read("products", { select: productSelect, limit: "1", id: "eq.42" }),
            read("product_variants", { select: variantSelect, limit: "1", id: "eq.51" }),
            read("offer_price_rules", { select: "*", limit: "1", offer_id: "eq.91" }),
            read("offer_price_proposals", {
                select: "*", offer_id: "eq.91", order: "created_at.desc", limit: "20",
            }),
            read("offer_media", { offer_id: "eq.91", select: mediaSelect, order: "sort_order.asc,id.asc" }),
            read("brands", { select: brandSelect, limit: "1", id: "eq.77" }),
            read("product_categories", {
                select: categorySelect, product_id: "eq.42", order: "is_primary.desc,position.asc",
            }),
        ]);
    });

    for (const scenario of optionalScenarios) {
        test(`skips only the absent optional reads when ${scenario.label}`, async () => {
            useFullOfferDetailResponder(scenario.options);

            const seller = await requestCommerce("/me/offer?id=91", {
                userId: "seller-user-123",
            });
            const sellerReads = reads().map(item => item.resource);
            const admin = await requestCommerce("/admin/offer?id=91", { userRole: null });
            const allReads = reads().map(item => item.resource);

            expect({ seller: seller.status, admin: admin.status }).toEqual({ seller: 200, admin: 200 });
            expect(sellerReads).toEqual(scenario.sellerResources);
            expect(allReads.slice(sellerReads.length)).toEqual(scenario.adminResources);
        });
    }
});

function reads(): Array<{ resource: string; query: Record<string, string> }> {
    return capturedFetches().map(call => {
        expect(call.method).toBe("GET");
        expect(call.headers.get("apikey")).toBe("sb_secret_test");
        expect(call.headers.get("authorization")).toBeNull();
        const url = new URL(call.url);
        return { resource: url.pathname.split("/").at(-1)!, query: Object.fromEntries(url.searchParams) };
    });
}

function read(resource: string, query: Record<string, string>): { resource: string; query: Record<string, string> } {
    return { resource, query };
}

const offerSelect = "id,seller_id,product_id,variant_id,slug,title,description,condition_code,publication_status,workflow_state,accepted_price_amount,currency,availability,quantity_available,metadata,version,created_at,updated_at";
const sellerSelect = "id,kind,slug,display_name,verification_status";
const productSelect = "id,slug,title,brand_id,status,visibility,metadata";
const variantSelect = "id,sku,title,status";
const sellerRuleSelect = "offer_id,minimum_amount,maximum_amount,currency,version,created_at,updated_at";
const sellerProposalSelect = "id,offer_id,amount,currency,status,decision_reason,decided_at,created_at";
const mediaSelect = "id,media_id,sort_order,is_main,media(id,storage_bucket,storage_path,mime_type,file_size,original_filename,alt,created_at,updated_at)";
const brandSelect = "id,slug,name,status";
const categorySelect = "category_id,is_primary,position,category:categories(id,parent_id,slug,full_slug,label,status,position)";

const optionalScenarios = [
    {
        label: "only the variant is absent",
        options: { variantId: null },
        sellerResources: [
            "offers", "sellers", "sellers", "products", "offer_price_rules",
            "offer_price_proposals", "offer_media", "brands", "product_categories",
            "custom_field_definitions",
        ],
        adminResources: [
            "offers", "sellers", "products", "offer_price_rules",
            "offer_price_proposals", "offer_media", "brands", "product_categories",
        ],
    },
    {
        label: "only the brand is absent",
        options: { brandId: null },
        sellerResources: [
            "offers", "sellers", "sellers", "products", "product_variants",
            "offer_price_rules", "offer_price_proposals", "offer_media",
            "product_categories", "custom_field_definitions",
        ],
        adminResources: [
            "offers", "sellers", "products", "product_variants", "offer_price_rules",
            "offer_price_proposals", "offer_media", "product_categories",
        ],
    },
    {
        label: "the variant and brand are absent",
        options: { variantId: null, brandId: null },
        sellerResources: [
            "offers", "sellers", "sellers", "products", "offer_price_rules",
            "offer_price_proposals", "offer_media", "product_categories",
            "custom_field_definitions",
        ],
        adminResources: [
            "offers", "sellers", "products", "offer_price_rules",
            "offer_price_proposals", "offer_media", "product_categories",
        ],
    },
] as const;
