import { expect } from "bun:test";
import {
    capturedFetches,
    jsonResponse,
    setRestResponder,
    supabaseUrl,
    type CapturedFetch,
    type JsonRecord,
} from "../../harness";

export const buyerCmsUserId = "buyer-user-456";
export const sellerCmsUserId = "seller-user-123";
export const checkoutRoute = "/system/protected-checkout/seller-context";
export const paymentRoute = "/system/protected-payment/seller-context";
export const sellerContextFunction = "get_protected_seller_context";

export function sellerContextResult(context: JsonRecord = {}): JsonRecord {
    return {
        state: "ok",
        context: {
            seller_cms_user_id: sellerCmsUserId,
            buyer_cms_user_id: buyerCmsUserId,
            ...context,
        },
    };
}

export function useSellerContextResponse(value: unknown = sellerContextResult(), status = 200): void {
    setRestResponder(() => jsonResponse(value, status));
}

export function useSellerContextFailure(status: number, message?: string): void {
    useSellerContextResponse(message ? { message } : {}, status);
}

export function expectSellerContextRpc(expectedBody: JsonRecord, start = 0): CapturedFetch {
    const calls = capturedFetches().slice(start);
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe(`${supabaseUrl}/rest/v1/rpc/${sellerContextFunction}`);
    expect(call.method).toBe("POST");
    expect(call.headers.get("apikey")).toBe("sb_secret_test");
    expect(call.headers.get("authorization")).toBeNull();
    expect(call.headers.get("accept-profile")).toBe("commerce");
    expect(call.headers.get("content-profile")).toBe("commerce");
    expect(call.body).toEqual(expectedBody);
    return call;
}

export async function responseBody(response: Response): Promise<[number, unknown]> {
    return [response.status, await response.json()];
}
