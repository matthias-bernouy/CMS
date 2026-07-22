import { expect } from "bun:test";
import { capturedFetches, supabaseUrl, type CapturedFetch } from "../../../../harness";
import { offerImageMediaId, offerImageOfferId, offerImagePath, offerImageSellerId } from "./fixtures";

export type OfferImageScope = "public" | "self" | "admin";

type ExpectedRead = {
    table: string;
    search: string;
};

export function callsSince(index: number): CapturedFetch[] {
    return capturedFetches().slice(index);
}

export function callKinds(calls: CapturedFetch[]): string[] {
    return calls.map((call) => {
        const url = new URL(call.url);
        return url.pathname.includes("/storage/v1/object/")
            ? `storage:${call.method}`
            : url.pathname.split("/").at(-1)!;
    });
}

export function expectNoStorage(calls: CapturedFetch[]): void {
    expect(calls.some((call) => call.url.includes("/storage/v1/object/"))).toBeFalse();
}

export function expectExactDatabaseReads(scope: OfferImageScope, calls: CapturedFetch[]): void {
    const database = calls.filter((call) => call.url.includes("/rest/v1/"));
    const expected = expectedReads(scope);
    expect(database).toHaveLength(expected.length);

    for (const [index, read] of expected.entries()) {
        const call = database[index]!;
        const url = new URL(call.url);
        expect(`${url.pathname}${url.search}`).toBe(`/rest/v1/${read.table}${read.search}`);
        expect(call.method).toBe("GET");
        expect(call.headers.get("apikey")).toBe("sb_secret_test");
        expect(call.headers.get("authorization")).toBeNull();
        expect(call.headers.get("accept-profile")).toBe("commerce");
        expect(call.headers.get("content-profile")).toBeNull();
        expect(call.body).toEqual({});
    }
}

export function storageSignature(calls: CapturedFetch[]): Record<string, unknown> {
    const storage = calls.filter((call) => call.url.includes("/storage/v1/object/"));
    expect(storage).toHaveLength(1);
    const call = storage[0]!;
    expect(decodeURIComponent(new URL(call.url).pathname)).toBe(`/storage/v1/object/commerce-media/${offerImagePath}`);
    return {
        url: call.url,
        method: call.method,
        apikey: call.headers.get("apikey"),
        authorization: call.headers.get("authorization"),
        acceptProfile: call.headers.get("accept-profile"),
        contentProfile: call.headers.get("content-profile"),
        body: call.body,
    };
}

function expectedReads(scope: OfferImageScope): ExpectedRead[] {
    const media: ExpectedRead = {
        table: "media",
        search: `?select=id%2Cstorage_bucket%2Cstorage_path%2Cmime_type&limit=1&id=eq.${offerImageMediaId}`,
    };
    if (scope === "admin") {
        return [media];
    }

    const ownership: ExpectedRead[] = [
        {
            table: "offer_media",
            search: `?select=offer_id&limit=1&media_id=eq.${offerImageMediaId}`,
        },
        {
            table: "offers",
            search:
                scope === "public"
                    ? `?select=publication_status%2Cseller_id&limit=1&id=eq.${offerImageOfferId}`
                    : `?select=seller_id&limit=1&id=eq.${offerImageOfferId}`,
        },
    ];
    if (scope === "public") {
        ownership.push(
            {
                table: "settings",
                search: "?select=require_verified_seller&limit=1&id=eq.default",
            },
            {
                table: "sellers",
                search: `?select=verification_status&limit=1&id=eq.${offerImageSellerId}`,
            },
        );
    } else {
        ownership.push({
            table: "sellers",
            search: `?select=cms_user_id&limit=1&id=eq.${offerImageSellerId}`,
        });
    }
    return [...ownership, media];
}

export function fetchCount(): number {
    return capturedFetches().length;
}

export function expectedStorageSignature(): Record<string, unknown> {
    return {
        url: `${supabaseUrl}/storage/v1/object/commerce-media/offers/91/private%20image.webp`,
        method: "GET",
        apikey: "sb_secret_test",
        authorization: null,
        acceptProfile: null,
        contentProfile: null,
        body: {},
    };
}
