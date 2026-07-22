import { expect } from "bun:test";
import { capturedFetches, supabaseUrl, type CapturedFetch } from "../../../../harness";
import { offerImageMediaId, offerImagePath } from "./fixtures";

export type OfferImageScope = "public" | "self" | "admin";

const downloadContextFunction = "get_offer_media_download_context";

export function callsSince(index: number): CapturedFetch[] {
    return capturedFetches().slice(index);
}

export function callKinds(calls: CapturedFetch[]): string[] {
    return calls.map((call) => {
        const url = new URL(call.url);
        if (url.pathname.includes("/storage/v1/object/")) {
            return `storage:${call.method}`;
        }
        const resource = url.pathname.split("/").at(-1)!;
        return url.pathname.includes("/rest/v1/rpc/") ? `rpc:${resource}` : resource;
    });
}

export function expectNoStorage(calls: CapturedFetch[]): void {
    expect(calls.some((call) => call.url.includes("/storage/v1/object/"))).toBeFalse();
}

export function expectSingleDownloadContextRpc(scope: OfferImageScope, calls: CapturedFetch[]): void {
    const database = calls.filter((call) => call.url.includes("/rest/v1/"));
    expect(database).toHaveLength(1);
    const call = database[0]!;
    expect(call.url).toBe(`${supabaseUrl}/rest/v1/rpc/${downloadContextFunction}`);
    expect(call.method).toBe("POST");
    expect(call.headers.get("apikey")).toBe("sb_secret_test");
    expect(call.headers.get("authorization")).toBeNull();
    expect(call.headers.get("accept-profile")).toBe("commerce");
    expect(call.headers.get("content-profile")).toBe("commerce");
    expect(call.body).toEqual({
        p_scope: scope,
        p_media_id: offerImageMediaId,
        p_cms_user_id: scope === "self" ? "seller-user-123" : null,
    });
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
