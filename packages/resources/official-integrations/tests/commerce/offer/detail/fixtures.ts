import { jsonResponse, setRestResponder } from "../../harness";

export const offerRow = {
    id: 91, seller_id: 7, product_id: 42, variant_id: 51,
    slug: "camera-offer", title: "Camera offer", description: null,
    condition_code: "good", publication_status: "draft", workflow_state: "pending_review",
    accepted_price_amount: 12500, currency: "eur", availability: "available",
    quantity_available: null,
    metadata: { privateSellerNote: "owner-visible", internal_note: "keep-snake-case" },
    version: 4,
    created_at: "2026-07-01T10:00:00Z", updated_at: "2026-07-04T10:00:00Z",
};

const sellerRow = {
    id: 7, kind: "user", slug: "seller-seven", display_name: "Seller Seven",
    verification_status: "verified",
};
const productRow = {
    id: 42, slug: "camera", title: "Camera", brand_id: 77, status: "active",
    visibility: "public", metadata: { publicSpec: "24MP", privateCost: 9000 },
};
const variantRow = { id: 51, sku: null, title: "Body only", status: "active" };
const priceRule = {
    offer_id: 91, minimum_amount: 11000, maximum_amount: 15000, currency: "eur",
    configured_by: "admin-1", version: 3,
    created_at: "2026-07-02T10:00:00Z", updated_at: "2026-07-03T10:00:00Z",
};
const proposals = [
    {
        id: 302, offer_id: 91, amount: 12500, currency: "eur", status: "pending",
        proposed_by: "seller", decided_by: null, decision_reason: null, decided_at: null,
        created_at: "2026-07-04T09:00:00Z",
    },
    {
        id: 301, offer_id: 91, amount: 12000, currency: "eur", status: "rejected",
        proposed_by: "admin", decided_by: "seller-user-123", decision_reason: "too low",
        decided_at: "2026-07-03T09:30:00Z", created_at: "2026-07-03T09:00:00Z",
    },
];
const mediaRows = [
    {
        id: 501, media_id: 201, sort_order: 1, is_main: false,
        media: {
            id: 201, storage_bucket: "commerce-media", storage_path: "offers/91/side.jpg",
            mime_type: "image/jpeg", file_size: 1200, original_filename: "side.jpg", alt: null,
            created_at: "2026-07-01T11:00:00Z", updated_at: "2026-07-01T11:00:00Z",
        },
    },
    {
        id: 502, media_id: 202, sort_order: 2, is_main: true,
        media: {
            id: 202, storage_bucket: "commerce-media", storage_path: "offers/91/front.jpg",
            mime_type: "image/jpeg", file_size: 1400, original_filename: "front.jpg", alt: "Front",
            created_at: "2026-07-01T12:00:00Z", updated_at: "2026-07-02T12:00:00Z",
        },
    },
];
const categoryRows = [
    {
        category_id: 88, is_primary: true, position: 5,
        category: {
            id: 88, parent_id: null, slug: "cameras", full_slug: "cameras",
            label: "Cameras", status: "active", position: 10,
        },
    },
    {
        category_id: 89, is_primary: false, position: 1,
        category: {
            id: 89, parent_id: null, slug: "used", full_slug: "used",
            label: "Used", status: "active", position: 20,
        },
    },
];

export function useFullOfferDetailResponder(options: {
    ownerCmsUserId?: string;
    variantId?: number | null;
    brandId?: number | null;
    mainMedia?: boolean;
} = {}): void {
    setRestResponder(request => {
        const url = new URL(request.url);
        const resource = resourceName(request);
        const select = url.searchParams.get("select");
        const variantId = options.variantId === undefined ? offerRow.variant_id : options.variantId;
        const brandId = options.brandId === undefined ? productRow.brand_id : options.brandId;
        if (resource === "offers") return jsonResponse([{ ...offerRow, variant_id: variantId }]);
        if (resource === "sellers" && select === "cms_user_id") {
            return jsonResponse([{ cms_user_id: options.ownerCmsUserId ?? "seller-user-123" }]);
        }
        if (resource === "sellers") return jsonResponse([sellerRow]);
        if (resource === "products") return jsonResponse([{ ...productRow, brand_id: brandId }]);
        if (resource === "product_variants") return jsonResponse([variantRow]);
        if (resource === "offer_price_rules") {
            if (select === "*") return jsonResponse([priceRule]);
            const { configured_by: _configuredBy, ...sellerRule } = priceRule;
            return jsonResponse([sellerRule]);
        }
        if (resource === "offer_price_proposals") {
            if (select === "*") return jsonResponse(proposals);
            return jsonResponse(proposals.map(({
                proposed_by: _proposedBy, decided_by: _decidedBy, ...proposal
            }) => proposal));
        }
        if (resource === "offer_media") {
            return jsonResponse(options.mainMedia === false
                ? mediaRows.map(row => ({ ...row, is_main: false }))
                : mediaRows);
        }
        if (resource === "brands") {
            return jsonResponse([{ id: 77, slug: "canon", name: "Canon", status: "active" }]);
        }
        if (resource === "product_categories") return jsonResponse(categoryRows);
        if (resource === "custom_field_definitions") return jsonResponse([{ key: "publicSpec" }]);
        throw new Error(`Unexpected offer detail request: ${request.url}`);
    });
}

export function resourceName(request: Request | { url: string }): string {
    return new URL(request.url).pathname.split("/").at(-1)!;
}
