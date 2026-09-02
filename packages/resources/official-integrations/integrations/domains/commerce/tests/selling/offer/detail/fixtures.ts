import { jsonResponse, setRestResponder } from "../../../harness";
import { adminOfferDetail, sellerOfferDetail } from "./expected";

type OfferDetailOptions = {
    ownerCmsUserId?: string;
    variantId?: number | null;
    brandId?: number | null;
    mainMedia?: boolean;
};

const readModel = "get_managed_offer_read_model";

export function useFullOfferDetailResponder(options: OfferDetailOptions = {}): void {
    setRestResponder(async (request) => {
        if (!new URL(request.url).pathname.endsWith(`/rpc/${readModel}`)) {
            throw new Error(`Unexpected offer detail request: ${request.url}`);
        }
        const body = (await request.clone().json()) as Record<string, unknown>;
        if (body.p_scope === "self") {
            const owner = options.ownerCmsUserId ?? "seller-user-123";
            if (body.p_cms_user_id === null) {
                return managedOfferState("identity_required");
            }
            if (body.p_cms_user_id !== owner) {
                return managedOfferState("not_found");
            }
        }
        return managedOfferResponse(offerDetailFor(String(body.p_scope), options));
    });
}

export function managedOfferResponse(value: Record<string, unknown>): Response {
    return jsonResponse({ state: "ok", offer: snakeCase(value) });
}

export function managedOfferState(state: string): Response {
    return jsonResponse({ state });
}

function offerDetailFor(scope: string, options: OfferDetailOptions): Record<string, unknown> {
    const detail = structuredClone(scope === "admin" ? adminOfferDetail : sellerOfferDetail) as Record<string, unknown>;
    if (options.variantId === null) {
        detail.variantId = null;
        detail.variant = null;
    }
    if (options.brandId === null && detail.product && typeof detail.product === "object") {
        const product = detail.product as Record<string, unknown>;
        product.brandId = null;
        product.brand = null;
    }
    if (options.mainMedia === false && Array.isArray(detail.media)) {
        detail.media = detail.media.map((item) => ({ ...item, isMain: false }));
        detail.mainImageMediaId = "201";
    }
    return detail;
}

function snakeCase(value: unknown, opaque = false): unknown {
    if (Array.isArray(value)) {
        return value.map((item) => snakeCase(item, opaque));
    }
    if (value === null || typeof value !== "object") {
        return value;
    }
    return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => {
            const snakeKey = opaque ? key : key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
            return [snakeKey, snakeCase(entry, opaque || key === "metadata")];
        }),
    );
}
