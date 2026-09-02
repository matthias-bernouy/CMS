import type { JsonRecord, LabelScenario } from "./harness";

export const observedAt = "2026-07-22T10:00:00.000Z";
export const rawToken = "label-access-contract-token";
export const tokenHash = "1bf5fee8fab070ce2cfc40a6d70d308695b4d619a72e9cb22f63d19a267a8577";
export const providerUrl = "https://connect-api-sandbox.mondialrelay.com/labels/exact.pdf";

export function shipmentRow(overrides: JsonRecord = {}): JsonRecord {
    return {
        id: "shipment-label-contract",
        expedition_number: "12345678",
        status: "label_ready",
        label_url: providerUrl,
        recipient_email: "must-not-leak@example.test",
        raw_response: { private: true },
        ...overrides,
    };
}

export function databaseResponse(
    request: Request,
    url: URL,
    text: string,
    scenario: LabelScenario,
    tokenState: NonNullable<LabelScenario["token"]>,
    shipment: JsonRecord | null,
): Response {
    if (url.pathname === "/rest/v1/rpc/get_label_access_context" && request.method === "POST") {
        const value =
            scenario.rpcResponse === undefined ? context(scenario, tokenState, shipment, text) : scenario.rpcResponse;
        return Response.json(value);
    }
    if (url.pathname === "/rest/v1/label_access_tokens" && request.method === "GET") {
        const seller = url.searchParams.get("seller_cms_user_id")?.replace(/^eq\./, "");
        return Response.json(tokenRows(scenario, tokenState, seller));
    }
    if (url.pathname === "/rest/v1/shipments" && request.method === "GET") {
        return Response.json(shipment ? [shipment] : []);
    }
    throw new Error(`unexpected database request: ${request.method} ${url.pathname}`);
}

export function providerResponse(mode: LabelScenario["provider"]): Response {
    if (mode === "redirect") {
        return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } });
    }
    if (mode === "missing") {
        return new Response(null, { status: 404 });
    }
    return new Response(mode === "html" ? "not a pdf" : "%PDF-1.7 exact-label", {
        headers: { "content-type": mode === "html" ? "text/html" : "application/pdf; charset=binary" },
    });
}

function tokenRows(scenario: LabelScenario, state: NonNullable<LabelScenario["token"]>, seller?: string): JsonRecord[] {
    if (state === "missing" || seller !== "seller-42") {
        return [];
    }
    return [
        {
            token_hash: tokenHash,
            shipment_id: "shipment-label-contract",
            seller_cms_user_id: "seller-42",
            expires_at: tokenExpiry(scenario, state),
            revoked_at: state === "revoked" ? "2026-07-22T09:55:00.000Z" : null,
            created_at: "2026-07-22T09:50:00.000Z",
        },
    ];
}

function context(
    scenario: LabelScenario,
    state: NonNullable<LabelScenario["token"]>,
    shipment: JsonRecord | null,
    body: string,
): JsonRecord {
    const params = JSON.parse(body) as JsonRecord;
    const seller = String(params.p_seller_cms_user_id ?? "");
    if (state === "missing" || state === "revoked" || seller !== "seller-42") {
        return { state: "not_found" };
    }
    const databaseObservedAt =
        typeof params.p_observed_at === "string" ? params.p_observed_at : new Date().toISOString();
    if (Date.parse(tokenExpiry(scenario, state)) <= Date.parse(databaseObservedAt)) {
        return { state: "expired" };
    }
    const refused = ["cancelled_unscanned", "cancelled", "manual_review"];
    if (!shipment || !shipment.label_url || refused.includes(String(shipment.status))) {
        return { state: "label_missing" };
    }
    return {
        state: "ok",
        shipment: { expedition_number: shipment.expedition_number, label_url: shipment.label_url },
    };
}

function tokenExpiry(scenario: LabelScenario, state: NonNullable<LabelScenario["token"]>): string {
    return scenario.tokenExpiresAt ?? (state === "expired" ? "2026-07-22T09:59:59.999Z" : "2026-07-22T10:10:00.000Z");
}
