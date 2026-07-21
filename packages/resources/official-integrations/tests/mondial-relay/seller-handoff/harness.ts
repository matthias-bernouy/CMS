import { afterAll } from "bun:test";

export type JsonRecord = Record<string, unknown>;

export type DatabaseCall = {
    method: string;
    pathname: string;
    searchParams: Record<string, string>;
    body?: JsonRecord;
};

type Scenario = {
    row?: JsonRecord | null;
    patchConflict?: boolean;
    failureMethod?: "GET" | "PATCH";
};

const supabaseUrl = "https://delivery.test";
const realFetch = globalThis.fetch;
const realDeno = (globalThis as { Deno?: unknown }).Deno;
let activeFetch: typeof fetch = realFetch;

afterAll(() => {
    globalThis.fetch = realFetch;
    (globalThis as { Deno?: unknown }).Deno = realDeno;
});

export function useDatabase(scenario: Scenario = {}): {
    calls: DatabaseCall[];
    storedRow: () => JsonRecord | null;
} {
    installGlobals();
    let row = scenario.row === undefined ? shipmentRow() : scenario.row;
    const calls: DatabaseCall[] = [];
    activeFetch = async (input, init) => {
        const request = input instanceof Request && !init
            ? input
            : new Request(input instanceof Request ? input.url : input, init);
        const url = new URL(request.url);
        const method = request.method.toUpperCase();
        if (url.origin !== supabaseUrl) {
            throw new Error(`unexpected provider call: ${request.url}`);
        }
        const text = method === "GET" ? "" : await request.clone().text();
        const call: DatabaseCall = {
            method,
            pathname: url.pathname,
            searchParams: Object.fromEntries(url.searchParams),
            ...(text ? { body: JSON.parse(text) as JsonRecord } : {}),
        };
        calls.push(call);
        if (scenario.failureMethod === method) {
            return Response.json({
                message: "private database failure",
                detail: "recipient_email=private@example.test",
            }, { status: 500 });
        }
        if (method === "GET" && url.pathname === "/rest/v1/shipments") {
            return Response.json(row ? [row] : []);
        }
        if (method === "PATCH" && url.pathname === "/rest/v1/shipments") {
            if (scenario.patchConflict || !row) return Response.json([]);
            row = { ...row, ...call.body };
            return Response.json([row]);
        }
        throw new Error(`unexpected database call: ${method} ${url.pathname}`);
    };
    return {
        calls,
        storedRow: () => row,
    };
}

function installGlobals(): void {
    (globalThis as {
        Deno?: { env: { get: (key: string) => string | undefined } };
    }).Deno = {
        env: {
            get(key) {
                if (key === "SUPABASE_URL") return supabaseUrl;
                if (key === "SUPABASE_SECRET_KEY") {
                    return "sb_secret_delivery_test";
                }
                return undefined;
            },
        },
    };
    globalThis.fetch = ((input, init) =>
        activeFetch(input, init)) as typeof fetch;
}

export function shipmentRow(overrides: JsonRecord = {}): JsonRecord {
    return {
        id: "shipment-42",
        external_order_id: "order-42",
        expedition_number: "12345678",
        status: "label_ready",
        seller_cms_user_id: "seller-42",
        carrier_accepted_at: null,
        recipient_handoff_at: null,
        seller_handoff_declared_at: null,
        recipient_name: "Private Buyer",
        recipient_email: "private@example.test",
        label_url: "https://provider.test/private-label.pdf",
        raw_response: { private: true },
        ...overrides,
    };
}
