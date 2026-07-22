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

export const defaultOfferRows: JsonRecord[] = [
    { id: 91, seller_id: 7 },
    { id: 92, seller_id: 7 },
];
export const defaultOrderRows: JsonRecord[] = [
    {
        id: 42,
        seller_id: 7,
        buyer_cms_user_id: buyerCmsUserId,
    },
];
export const defaultSellerRows: JsonRecord[] = [
    {
        id: 7,
        kind: "user",
        cms_user_id: sellerCmsUserId,
    },
];

type DatabaseResource = "offers" | "orders" | "sellers";
type Failure = { body?: unknown; status: number };
type SellerContextData = {
    offers?: JsonRecord[];
    orders?: JsonRecord[];
    sellers?: JsonRecord[];
    failures?: Partial<Record<DatabaseResource, Failure>>;
};

export function useSellerContextData(data: SellerContextData = {}): void {
    const rows: Record<DatabaseResource, JsonRecord[]> = {
        offers: data.offers ?? defaultOfferRows,
        orders: data.orders ?? defaultOrderRows,
        sellers: data.sellers ?? defaultSellerRows,
    };
    setRestResponder((request) => {
        const resource = databaseResource(request.url);
        const failure = data.failures?.[resource];
        if (failure) {
            return jsonResponse(failure.body ?? {}, failure.status);
        }
        return jsonResponse(rows[resource]);
    });
}

export function expectDatabaseReads(expectedResources: DatabaseResource[], start = 0): CapturedFetch[] {
    const calls = capturedFetches().slice(start);
    expect(calls).toHaveLength(expectedResources.length);
    calls.forEach((call, index) => {
        const resource = expectedResources[index]!;
        expect(databaseResource(call.url)).toBe(resource);
        expect(call.url.startsWith(`${supabaseUrl}/rest/v1/`)).toBeTrue();
        expect(call.method).toBe("GET");
        expect(call.headers.get("apikey")).toBe("sb_secret_test");
        expect(call.headers.get("authorization")).toBeNull();
        expect(call.headers.get("accept-profile")).toBe("commerce");
        expect(call.headers.get("content-profile")).toBeNull();
        expect(call.body).toEqual({});
    });
    return calls;
}

export function expectQuery(call: CapturedFetch, expected: Record<string, string>): void {
    const searchParams = new URL(call.url).searchParams;
    expect([...searchParams]).toHaveLength(Object.keys(expected).length);
    expect(Object.fromEntries(searchParams)).toEqual(expected);
}

export async function responseBody(response: Response): Promise<[number, unknown]> {
    return [response.status, await response.json()];
}

function databaseResource(url: string): DatabaseResource {
    const parsed = new URL(url);
    if (!parsed.pathname.startsWith("/rest/v1/")) {
        throw new Error(`Unexpected provider request: ${url}`);
    }
    const resource = parsed.pathname.split("/").at(-1);
    if (resource !== "offers" && resource !== "orders" && resource !== "sellers") {
        throw new Error(`Unexpected Commerce database resource: ${url}`);
    }
    return resource;
}
