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
    mutationConflict?: boolean;
    failureMethod?: "POST";
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
        const request =
            input instanceof Request && !init ? input : new Request(input instanceof Request ? input.url : input, init);
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
            return Response.json(
                {
                    message: "private database failure",
                    detail: "recipient_email=private@example.test",
                },
                { status: 500 },
            );
        }
        if (method === "POST" && url.pathname === "/rest/v1/rpc/declare_seller_handoff") {
            const externalOrderId = String(call.body?.p_external_order_id ?? "");
            const actor = String(call.body?.p_seller_cms_user_id ?? "").trim();
            if (!actor) {
                return databaseError(400, "validation: seller CMS user id is required");
            }
            if (!row || row.external_order_id !== externalOrderId || row.seller_cms_user_id !== actor) {
                return databaseError(404, "not_found: shipment not found");
            }
            if (row.seller_handoff_declared_at) {
                return Response.json(handoffRow(row));
            }
            if (row.carrier_accepted_at || row.status !== "label_ready") {
                return databaseError(409, "conflict: seller handoff cannot be declared for the current shipment state");
            }
            if (scenario.mutationConflict) {
                return databaseError(409, "conflict: shipment state changed while declaring seller handoff");
            }
            row = {
                ...row,
                seller_handoff_declared_at: new Date().toISOString(),
            };
            return Response.json(handoffRow(row));
        }
        throw new Error(`unexpected database call: ${method} ${url.pathname}`);
    };
    return {
        calls,
        storedRow: () => row,
    };
}

function databaseError(status: number, message: string): Response {
    return Response.json({ message }, { status });
}

function handoffRow(row: JsonRecord): JsonRecord {
    return {
        id: row.id,
        external_order_id: row.external_order_id,
        expedition_number: row.expedition_number,
        status: row.status,
        carrier_accepted_at: row.carrier_accepted_at,
        recipient_handoff_at: row.recipient_handoff_at,
        seller_handoff_declared_at: row.seller_handoff_declared_at,
    };
}

function installGlobals(): void {
    (
        globalThis as {
            Deno?: { env: { get: (key: string) => string | undefined } };
        }
    ).Deno = {
        env: {
            get(key) {
                if (key === "SUPABASE_URL") {
                    return supabaseUrl;
                }
                if (key === "SUPABASE_SECRET_KEY") {
                    return "sb_secret_delivery_test";
                }
                return undefined;
            },
        },
    };
    globalThis.fetch = ((input, init) => activeFetch(input, init)) as typeof fetch;
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
