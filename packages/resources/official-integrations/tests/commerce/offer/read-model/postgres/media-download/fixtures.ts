import { jsonResponse, setRestResponder, type JsonRecord } from "../../../../harness";

export const offerImageMediaId = 12;
export const offerImageOfferId = 91;
export const offerImageSellerId = 31;
export const offerImagePath = "offers/91/private image.webp";
export const offerImageBytes = Uint8Array.from([0, 17, 34, 128, 255, 64, 9]);

export const linkedOfferRow: JsonRecord = {
    offer_id: offerImageOfferId,
};

export const activeOfferRow: JsonRecord = {
    publication_status: "active",
    seller_id: offerImageSellerId,
};

export const verifiedOwnerRow: JsonRecord = {
    verification_status: "verified",
    cms_user_id: "seller-user-123",
};

export const verifiedSellerSettings: JsonRecord = {
    require_verified_seller: true,
};

export const offerImageMediaRow: JsonRecord = {
    id: offerImageMediaId,
    storage_bucket: "commerce-media",
    storage_path: offerImagePath,
    mime_type: "image/jpeg",
    service_role_key: "row-secret-must-not-leak",
};

export type OfferImageFixtureOptions = {
    offerMedia?: JsonRecord | null;
    offer?: JsonRecord | null;
    settings?: JsonRecord | null;
    seller?: JsonRecord | null;
    media?: JsonRecord | null;
    storage?: {
        status?: number;
        message?: string;
        bytes?: Uint8Array;
        headers?: HeadersInit;
    };
};

export function useOfferImageResponder(options: OfferImageFixtureOptions = {}): void {
    setRestResponder((request) => {
        const url = new URL(request.url);
        if (url.pathname.includes("/storage/v1/object/")) {
            return storageResponse(options.storage);
        }

        const row = tableRow(url.pathname.split("/").at(-1)!, options);
        return jsonResponse(row ? [row] : []);
    });
}

function tableRow(table: string, options: OfferImageFixtureOptions): JsonRecord | null {
    if (table === "offer_media") {
        return configured(options.offerMedia, linkedOfferRow);
    }
    if (table === "offers") {
        return configured(options.offer, activeOfferRow);
    }
    if (table === "settings") {
        return configured(options.settings, verifiedSellerSettings);
    }
    if (table === "sellers") {
        return configured(options.seller, verifiedOwnerRow);
    }
    if (table === "media") {
        return configured(options.media, offerImageMediaRow);
    }
    return null;
}

function configured<T>(value: T | undefined, fallback: T): T {
    return value === undefined ? fallback : value;
}

function storageResponse(storage: OfferImageFixtureOptions["storage"]): Response {
    const status = storage?.status ?? 200;
    if (status >= 400) {
        return jsonResponse({ message: storage?.message ?? "storage unavailable" }, status);
    }
    const headers =
        storage?.headers ??
        new Headers({
            "content-type": "image/webp",
            etag: 'W/"offer-image-12"',
            "last-modified": "Tue, 21 Jul 2026 10:30:00 GMT",
            apikey: "storage-secret-must-not-leak",
            authorization: "Bearer storage-secret-must-not-leak",
            "x-storage-bucket": "commerce-media",
            "x-storage-path": offerImagePath,
        });
    return new Response(storage?.bytes ?? offerImageBytes, { status, headers });
}
