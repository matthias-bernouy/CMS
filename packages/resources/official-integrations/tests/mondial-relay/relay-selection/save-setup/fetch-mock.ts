import { customSettingsRow, type JsonRecord, relayPointResponse } from "./fixtures.ts";
import type { LogicalStep, ObservedRequest, SaveSetupOptions } from "./harness.ts";

const setupRpcPath = "/rest/v1/rpc/read_relay_selection_setup_context";

export function createFetchMock(options: SaveSetupOptions) {
    const logicalSteps: LogicalStep[] = [];
    const requests: ObservedRequest[] = [];

    const fetchImpl = (async (input, init) => {
        const request = input instanceof Request && !init ? input : new Request(String(input), init);
        const url = new URL(request.url);
        const method = request.method.toUpperCase();
        const bodyText = method === "GET" || method === "HEAD" ? "" : await request.clone().text();
        const kind = url.origin === "https://project.supabase.co" ? "database" : "provider";
        const observed: ObservedRequest = { kind, method, pathname: url.pathname, search: url.search };
        if (bodyText) {
            observed.body = JSON.parse(bodyText) as JsonRecord;
        }
        requests.push(observed);

        if (url.pathname === setupRpcPath) {
            logicalSteps.push("shipment");
            if (options.failure === "shipment") {
                return databaseFailure();
            }
            if (options.shipmentExists) {
                return jsonResponse({ outcome: "shipment_exists", settings: null });
            }
            if (observed.body?.p_read_settings !== true) {
                return jsonResponse({ outcome: "ready", settings: null });
            }
            logicalSteps.push("settings");
            if (options.failure === "settings") {
                return databaseFailure();
            }
            return jsonResponse({ outcome: "ready", settings: selectedSettings(options) });
        }
        if (url.pathname === "/rest/v1/shipments" && method === "GET") {
            logicalSteps.push("shipment");
            if (options.failure === "shipment") {
                return databaseFailure();
            }
            return jsonResponse(options.shipmentExists ? [{ id: "shipment-existing" }] : []);
        }
        if (url.pathname === "/rest/v1/settings" && method === "GET") {
            logicalSteps.push("settings");
            if (options.failure === "settings") {
                return databaseFailure();
            }
            const settings = selectedSettings(options);
            return jsonResponse(settings ? [settings] : []);
        }
        if (url.origin === "https://widget.mondialrelay.com" && url.pathname.endsWith("/SearchPR")) {
            logicalSteps.push("provider");
            if (options.failure === "provider") {
                return jsonResponse({ message: "provider unavailable" }, 503);
            }
            return new Response(`cmsRelayPoints(${JSON.stringify(relayPointResponse())});`, {
                status: 200,
                headers: { "content-type": "application/javascript" },
            });
        }
        if (url.pathname === "/rest/v1/rpc/reserve_delivery_quote" && method === "POST") {
            logicalSteps.push("write");
            if (options.failure === "write") {
                return databaseFailure();
            }
            return jsonResponse(quoteRow(observed.body ?? {}));
        }
        if (url.pathname === "/rest/v1/relay_selections" && method === "POST") {
            logicalSteps.push("write");
            if (options.failure === "write") {
                return databaseFailure();
            }
            return jsonResponse([selectionRow(observed.body ?? {})], 201);
        }
        throw new Error(`unexpected fetch ${method} ${request.url}`);
    }) as typeof fetch;

    return { fetchImpl, logicalSteps, requests };
}

function selectedSettings(options: SaveSetupOptions): JsonRecord | null {
    return options.settings === undefined ? customSettingsRow() : options.settings;
}

function quoteRow(body: JsonRecord): JsonRecord {
    return {
        quote_id: body.p_quote_id,
        external_order_id: body.p_external_order_id,
        order_version: body.p_order_version,
        revision: 1,
        selected_for_cms_user_id: body.p_selected_for_cms_user_id,
        relay_location: body.p_relay_location,
        relay_country: body.p_relay_country,
        relay_number: body.p_relay_number,
        relay_name: body.p_relay_name,
        relay_address_line1: body.p_relay_address_line1,
        relay_address_line2: body.p_relay_address_line2,
        relay_postal_code: body.p_relay_postal_code,
        relay_city: body.p_relay_city,
        relay_latitude: body.p_relay_latitude,
        relay_longitude: body.p_relay_longitude,
        relay_snapshot: body.p_relay_snapshot,
        weight_grams: body.p_weight_grams,
        shipping_amount: body.p_shipping_amount,
        currency: body.p_currency,
        merchandise_subtotal_minor_amount: body.p_merchandise_subtotal_minor_amount,
        quoted_at: "2026-07-22T10:00:00.000Z",
        expires_at: "2026-07-22T10:15:00.000Z",
    };
}

function selectionRow(body: JsonRecord): JsonRecord {
    return {
        ...body,
        created_at: "2026-07-22T09:55:00.000Z",
        updated_at: "2026-07-22T10:00:00.000Z",
    };
}

function jsonResponse(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function databaseFailure(): Response {
    return jsonResponse({ message: "private relay selection setup failure" }, 500);
}
