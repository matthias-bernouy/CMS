import { readFileSync } from "node:fs";
import { afterAll, expect, setSystemTime, test } from "bun:test";
import {
    importIntegration,
    type IntegrationBlocArtifact,
    type IntegrationConnectorDeployer,
    type IntegrationConnectorDeployment,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryDashboardRepository, validateDashboard } from "@bernouy/cms-dashboards";
import { InMemorySecretStore, secretRefToKey } from "@bernouy/cms-secrets";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
import {
    handleSourceRequest,
    InMemorySourceRepository,
    sourceEndpointAccessAllows,
    sourceEndpointAccessMode,
    validateSource,
    type SourceRepository,
} from "@bernouy/cms-sources";
import { md5 } from "../../../integrations/mondial-relay/versions/1.0.0/connectors/supabase/functions/cms-delivery/provider/md5.ts";
import {
    fallbackTrackingStatus,
    normalizeTrackingLabel,
    statusAfterObservation,
} from "../../../integrations/mondial-relay/versions/1.0.0/connectors/supabase/functions/cms-delivery/provider/tracking-status.ts";
import { handleError } from "../../../integrations/mondial-relay/versions/1.0.0/connectors/supabase/functions/cms-delivery/http.ts";
import { dataApiError } from "../../../integrations/mondial-relay/versions/1.0.0/connectors/supabase/functions/cms-delivery/shipment/supabase.ts";

export {
    FsIntegrationDefinitionRepository,
    OFFICIAL_INTEGRATIONS_ROOT,
    dataApiError,
    expect,
    fallbackTrackingStatus,
    handleError,
    md5,
    normalizeTrackingLabel,
    setSystemTime,
    statusAfterObservation,
    test,
    validateDashboard,
    validateSource,
};

export type EdgeHandler = (request: Request) => Response | Promise<Response>;
export type JsonRecord = Record<string, unknown>;
export type ObservedFetchRequest = {
    method: string;
    url: string;
    pathname: string;
    searchParams: Record<string, string>;
    body?: unknown;
};
export type ObservedFetchStep = {
    kind: "postgrest" | "provider";
    method: string;
    pathname: string;
};

export const sourcePrefix = "/.cms/sources/";
export const functionsBaseUrl = "https://project.supabase.co/functions/v1";
export const supabaseUrl = "https://project.supabase.co";
export const connectEndpoint = "https://connect-api-sandbox.mondialrelay.com/api/shipment";
export const trackingEndpoint = "https://api.mondialrelay.com/WebService.asmx";
export const definitionUrl = new URL(
    "../../../integrations/mondial-relay/versions/1.0.0/definition.json",
    import.meta.url,
);
export const edgeFunctionUrl =
    "../../../integrations/mondial-relay/versions/1.0.0/connectors/supabase/functions/cms-delivery/index.ts";

const realFetch = globalThis.fetch;
const realDeno = (globalThis as { Deno?: unknown }).Deno;
export let activeEnv: Record<string, string> = {};
export let activeFetch: typeof fetch = realFetch;
export let edgeHandler: EdgeHandler | undefined;

(
    globalThis as {
        Deno?: { env: { get: (key: string) => string | undefined }; serve: (handler: EdgeHandler) => unknown };
    }
).Deno = {
    env: { get: (key) => activeEnv[key] },
    serve(handler) {
        edgeHandler = handler;
        return {
            shutdown() {
                /* test stub */
            },
        };
    },
};
globalThis.fetch = ((input, init) => activeFetch(input, init)) as typeof fetch;

afterAll(() => {
    setSystemTime();
    globalThis.fetch = realFetch;
    (globalThis as { Deno?: unknown }).Deno = realDeno;
});

export async function createHarness(
    options: {
        connectNetworkError?: boolean;
        connectRedirect?: boolean;
        connectStatusCode?: string;
        connectStatusLevel?: string;
        connectStatusMessage?: string;
        connectResponses?: Array<{ code: string; level: string; message: string }>;
        trackingEventLabel?: string;
        trackingStatusCode?: string;
        cancellationRaceOnReconciliation?: "cancelled_unscanned" | "cancelled";
        trackingRedirect?: boolean;
        labelUrl?: string;
        labelContentType?: string;
        labelRedirect?: boolean;
        shipmentLeasePatchMiss?: boolean;
        shipmentLeasePatchFailure?: boolean;
    } = {},
) {
    const sources = new InMemorySourceRepository();
    const secrets = new InMemorySecretStore();
    const roles = new InMemoryRolesRepository();
    const dashboards = new InMemoryDashboardRepository();
    let deployment: IntegrationConnectorDeployment | undefined;
    const importedBlocs: IntegrationBlocArtifact[] = [];
    const deployer: IntegrationConnectorDeployer = {
        provider: "supabase",
        async deploy(next) {
            deployment = next;
            return {
                provider: "supabase",
                outputs: { functionsBaseUrl },
                resources: [
                    { type: "schema", id: "schema.sql", action: "applied" },
                    { type: "function", id: "cms-delivery", action: "deployed" },
                ],
            };
        },
    };

    const hydratedDefinition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get(
        "mondial-relay",
    );
    if (!hydratedDefinition) {
        throw new Error("mondial-relay definition not found");
    }
    const result = await importIntegration(
        {
            sources,
            secrets,
            roles,
            dashboards,
            connectorDeployers: [deployer],
            blocs: {
                async importBloc(artifact) {
                    importedBlocs.push(artifact);
                    return { id: artifact.tag, action: "created" };
                },
            },
        },
        { kind: "mondial-relay", answers: integrationAnswers(), options: {} },
        [hydratedDefinition],
    );
    const functionSecrets = deployment?.functions[0]?.secrets ?? {};
    activeEnv = {
        ...Object.fromEntries(Object.entries(functionSecrets).map(([key, value]) => [key, String(value)])),
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SECRET_KEYS: JSON.stringify({
            default: "sb_secret_delivery_test",
            secondary: "sb_secret_delivery_secondary",
        }),
        SUPABASE_SERVICE_ROLE_KEY: "legacy-service-role-key",
    };

    const handler = await loadEdgeHandler();
    const insertedShipments: JsonRecord[] = [];
    const shipmentEvents: JsonRecord[] = [];
    const labelAccessTokens: JsonRecord[] = [];
    const shipmentRecoveryEvents: JsonRecord[] = [];
    const relaySelections: JsonRecord[] = [];
    const deliveryQuotes: JsonRecord[] = [defaultDeliveryQuoteRow()];
    let settingRow = defaultSettingsRow();
    let connectRequestXml = "";
    let connectRequestCount = 0;
    let connectRequestRedirect = "";
    let trackingRequestXml = "";
    let trackingRequestCount = 0;
    let trackingRequestRedirect = "";
    let cancellationRaceInjected = false;
    let relayLookupUrl: URL | undefined;
    const upstreamRequestUrls: string[] = [];
    const postgrestRequests: ObservedFetchRequest[] = [];
    const providerRequests: ObservedFetchRequest[] = [];
    const fetchTimeline: ObservedFetchStep[] = [];
    activeFetch = async (input, init) => {
        const request = requestFromFetchInput(input, init);
        const url = new URL(request.url);
        const method = request.method.toUpperCase();
        const requestBody = method === "GET" || method === "HEAD" ? "" : await request.clone().text();
        const observed = observeFetchRequest(request, url, method, requestBody);
        if (url.origin === supabaseUrl) {
            postgrestRequests.push(observed);
            fetchTimeline.push({ kind: "postgrest", method, pathname: url.pathname });
        } else {
            providerRequests.push(observed);
            fetchTimeline.push({ kind: "provider", method, pathname: url.pathname });
        }
        if (url.origin !== supabaseUrl) {
            upstreamRequestUrls.push(request.url);
        }

        if (url.origin === "https://widget.mondialrelay.com" && url.pathname.endsWith("/SearchPR")) {
            relayLookupUrl = url;
            return jsonpResponse(widgetRelayLookupResponse());
        }
        if (request.url === connectEndpoint) {
            connectRequestXml = requestBody;
            connectRequestCount += 1;
            connectRequestRedirect = request.redirect;
            if (options.connectNetworkError) {
                throw new TypeError("network unavailable");
            }
            if (options.connectRedirect) {
                return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } });
            }
            const configured = options.connectResponses?.[connectRequestCount - 1];
            return xmlResponse(
                connectShipmentResponse(
                    configured
                        ? {
                              connectStatusCode: configured.code,
                              connectStatusLevel: configured.level,
                              connectStatusMessage: configured.message,
                          }
                        : options,
                ),
            );
        }
        if (request.url === trackingEndpoint) {
            trackingRequestXml = requestBody;
            trackingRequestCount += 1;
            trackingRequestRedirect = request.redirect;
            if (options.trackingRedirect) {
                return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } });
            }
            return xmlResponse(trackingResponse(options.trackingEventLabel, options.trackingStatusCode));
        }
        if (
            url.origin === "https://connect-api-sandbox.mondialrelay.com" ||
            url.origin === "https://connect-sandbox.mondialrelay.com"
        ) {
            if (options.labelRedirect) {
                return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } });
            }
            return new Response("%PDF-1.4 test", {
                status: 200,
                headers: { "content-type": options.labelContentType ?? "application/pdf" },
            });
        }
        if (url.origin === supabaseUrl) {
            expect(request.headers.get("apikey")).toBe("sb_secret_delivery_test");
            expect(request.headers.get("authorization")).toBeNull();
            expect(request.headers.get("accept-profile")).toBe("delivery");
            if (method !== "GET" && method !== "HEAD") {
                expect(request.headers.get("content-profile")).toBe("delivery");
            }
        }
        if (
            url.origin === supabaseUrl &&
            url.pathname === "/rest/v1/rpc/reserve_shipment_creation" &&
            method === "POST"
        ) {
            const body = JSON.parse(requestBody) as JsonRecord;
            const reservation = body.p_reservation as JsonRecord;
            const validationError = shipmentReservationError(body, deliveryQuotes, relaySelections);
            if (validationError) {
                return jsonResponse({ message: `conflict: ${validationError}` }, 409);
            }
            const existing = insertedShipments.find((row) => row.idempotency_key === reservation.idempotency_key);
            if (existing) {
                if (stableJson(existing.raw_request) !== stableJson(reservation.raw_request)) {
                    return jsonResponse(
                        {
                            message: "conflict: idempotency key was already used with a different shipment payload",
                        },
                        409,
                    );
                }
                if (existing.status === "failed") {
                    const { id: _id, idempotency_key: _key, ...retryReservation } = reservation;
                    Object.assign(existing, retryReservation, {
                        status: "creating",
                        last_error: null,
                        updated_at: "2026-07-02T10:05:00.000Z",
                    });
                    return jsonResponse({ outcome: "provider_required", shipment: existing }, 200);
                }
                if (existing.status === "creating") {
                    return jsonResponse({ outcome: "creating", shipment: existing }, 200);
                }
                if (existing.status === "unknown") {
                    return jsonResponse({ outcome: "unknown", shipment: existing }, 200);
                }
                return jsonResponse({ outcome: "replay", shipment: existing }, 200);
            }
            const stored = {
                ...reservation,
                created_at: "2026-07-02T10:00:00.000Z",
                updated_at: "2026-07-02T10:00:00.000Z",
            };
            insertedShipments.push(stored);
            return jsonResponse({ outcome: "provider_required", shipment: stored }, 200);
        }
        if (url.origin === supabaseUrl && url.pathname === "/rest/v1/shipments" && method === "POST") {
            const row = JSON.parse(requestBody) as JsonRecord;
            const duplicate = insertedShipments.some((item) => item.idempotency_key === row.idempotency_key);
            if (duplicate && request.headers.get("prefer")?.includes("resolution=ignore-duplicates")) {
                return jsonResponse([], 200);
            }
            const stored = {
                ...row,
                created_at: "2026-07-02T10:00:00.000Z",
                updated_at: "2026-07-02T10:00:00.000Z",
            };
            insertedShipments.push(stored);
            return jsonResponse(projectRows(url, [stored]), 201);
        }
        if (url.origin === supabaseUrl && url.pathname === "/rest/v1/shipments" && method === "PATCH") {
            const patch = JSON.parse(requestBody) as JsonRecord;
            const id = url.searchParams.get("id")?.replace(/^eq\./, "");
            const status = url.searchParams.get("status")?.replace(/^eq\./, "");
            const isShipmentLeaseExpiry =
                status === "creating" &&
                patch.status === "unknown" &&
                patch.last_error === "shipment creation lease expired before a provider outcome was attached";
            if (isShipmentLeaseExpiry && options.shipmentLeasePatchFailure) {
                return jsonResponse({ message: "private shipment lease update failure" }, 500);
            }
            if (isShipmentLeaseExpiry && options.shipmentLeasePatchMiss) {
                return jsonResponse([], 200);
            }
            if (
                !cancellationRaceInjected &&
                options.cancellationRaceOnReconciliation &&
                patch.tracking_checked_at &&
                id
            ) {
                const racingRow = insertedShipments.find((item) => item.id === id && item.status === status);
                if (racingRow) {
                    Object.assign(racingRow, {
                        status: options.cancellationRaceOnReconciliation,
                        cancellation_tracking_until: "2099-07-12T09:30:00.000Z",
                        last_error: "cancellation committed during reconciliation",
                    });
                    cancellationRaceInjected = true;
                }
            }
            const index = insertedShipments.findIndex(
                (item) => (!id || item.id === id) && (!status || item.status === status),
            );
            if (index < 0) {
                return jsonResponse([], 200);
            }
            const stored = {
                ...insertedShipments[index],
                ...patch,
                updated_at: "2026-07-02T10:05:00.000Z",
            };
            insertedShipments[index] = stored;
            return jsonResponse(projectRows(url, [stored]), 200);
        }
        if (url.origin === supabaseUrl && url.pathname === "/rest/v1/relay_selections" && method === "POST") {
            const row = JSON.parse(requestBody) as JsonRecord;
            const index = relaySelections.findIndex((item) => item.external_order_id === row.external_order_id);
            const stored = {
                ...(index >= 0 ? relaySelections[index] : {}),
                ...row,
                created_at: index >= 0 ? relaySelections[index]?.created_at : "2026-07-02T10:00:00.000Z",
                updated_at: "2026-07-02T10:05:00.000Z",
            };
            if (index >= 0) {
                relaySelections[index] = stored;
            } else {
                relaySelections.push(stored);
            }
            return jsonResponse(projectRows(url, [stored]), 201);
        }
        if (url.origin === supabaseUrl && url.pathname === "/rest/v1/relay_selections" && method === "GET") {
            const externalOrderId = url.searchParams.get("external_order_id")?.replace(/^eq\./, "");
            return jsonResponse(
                projectRows(
                    url,
                    relaySelections.filter((row) => !externalOrderId || row.external_order_id === externalOrderId),
                ),
                200,
            );
        }
        if (
            url.origin === supabaseUrl &&
            url.pathname === "/rest/v1/rpc/read_relay_selection_setup_context" &&
            method === "POST"
        ) {
            const body = JSON.parse(requestBody) as JsonRecord;
            const shipment = insertedShipments.find(
                (row) => row.external_order_id === String(body.p_external_order_id ?? ""),
            );
            if (shipment) {
                return jsonResponse({ outcome: "shipment_exists", settings: null }, 200);
            }
            return jsonResponse(
                {
                    outcome: "ready",
                    settings: body.p_read_settings === true ? settingRow : null,
                },
                200,
            );
        }
        if (
            url.origin === supabaseUrl &&
            url.pathname === "/rest/v1/rpc/read_relay_selection_context" &&
            method === "POST"
        ) {
            const body = JSON.parse(requestBody) as JsonRecord;
            const externalOrderId = String(body.p_external_order_id ?? "");
            const selection = relaySelections.find((row) => row.external_order_id === externalOrderId);
            if (selection) {
                return jsonResponse({ outcome: "selection", row: selection }, 200);
            }
            const selectedFor = String(body.p_selected_for_cms_user_id ?? "");
            const quote = deliveryQuotes
                .filter(
                    (row) => row.external_order_id === externalOrderId && row.selected_for_cms_user_id === selectedFor,
                )
                .sort((left, right) => Number(right.revision) - Number(left.revision))[0];
            if (!quote) {
                return jsonResponse({ outcome: "missing", row: null }, 200);
            }
            const publicQuote = { ...quote };
            delete publicQuote.recipient_snapshot;
            delete publicQuote.seller_fulfillment_snapshot;
            delete publicQuote.request_snapshot;
            return jsonResponse({ outcome: "quote", row: publicQuote }, 200);
        }
        if (url.origin === supabaseUrl && url.pathname === "/rest/v1/delivery_quotes" && method === "GET") {
            const quoteId = url.searchParams.get("quote_id")?.replace(/^eq\./, "");
            const externalOrderId = url.searchParams.get("external_order_id")?.replace(/^eq\./, "");
            const selectedFor = url.searchParams.get("selected_for_cms_user_id")?.replace(/^eq\./, "");
            return jsonResponse(
                projectRows(
                    url,
                    deliveryQuotes.filter(
                        (row) =>
                            (!quoteId || row.quote_id === quoteId) &&
                            (!externalOrderId || row.external_order_id === externalOrderId) &&
                            (!selectedFor || row.selected_for_cms_user_id === selectedFor),
                    ),
                ),
                200,
            );
        }
        if (url.origin === supabaseUrl && url.pathname === "/rest/v1/rpc/reserve_delivery_quote" && method === "POST") {
            const body = JSON.parse(requestBody) as JsonRecord;
            const existing = deliveryQuotes.find((row) => row.request_key === body.p_request_key);
            if (existing) {
                if (
                    existing.request_snapshot !== undefined &&
                    JSON.stringify(existing.request_snapshot) !== JSON.stringify(body.p_request_snapshot)
                ) {
                    return jsonResponse(
                        { message: "conflict: delivery quote request replay changed immutable input" },
                        409,
                    );
                }
                return jsonResponse(existing, 200);
            }
            const now = "2026-07-13T10:00:00.000Z";
            const stored = {
                quote_id: body.p_quote_id,
                request_key: body.p_request_key,
                external_order_id: body.p_external_order_id,
                order_version: body.p_order_version,
                revision: deliveryQuotes.filter((row) => row.external_order_id === body.p_external_order_id).length + 1,
                selected_by: body.p_selected_by,
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
                weight_grams: body.p_weight_grams,
                shipping_amount: body.p_shipping_amount,
                currency: body.p_currency,
                merchandise_subtotal_minor_amount: body.p_merchandise_subtotal_minor_amount,
                recipient_snapshot: body.p_recipient_snapshot,
                seller_fulfillment_snapshot: body.p_seller_fulfillment_snapshot,
                relay_snapshot: body.p_relay_snapshot,
                request_snapshot: body.p_request_snapshot,
                quoted_at: now,
                expires_at: "2099-07-13T10:15:00.000Z",
                created_at: now,
            };
            deliveryQuotes.push(stored);
            return jsonResponse(stored, 200);
        }
        if (url.origin === supabaseUrl && url.pathname === "/rest/v1/settings" && method === "POST") {
            const row = JSON.parse(requestBody) as JsonRecord;
            settingRow = {
                ...settingRow,
                ...row,
                id: "default",
                updated_at: "2026-07-02T11:00:00.000Z",
            };
            return jsonResponse([settingRow], 201);
        }
        if (url.origin === supabaseUrl && url.pathname === "/rest/v1/settings" && method === "GET") {
            return jsonResponse([settingRow], 200);
        }
        if (url.origin === supabaseUrl && url.pathname === "/rest/v1/shipments" && method === "GET") {
            const fields = selectedFields(url);
            expect(fields).not.toContain("shipping_amount");
            expect(fields).not.toContain("currency");
            const id = url.searchParams.get("id")?.replace(/^eq\./, "");
            const externalOrderId = url.searchParams.get("external_order_id")?.replace(/^eq\./, "");
            const expeditionNumber = url.searchParams.get("expedition_number")?.replace(/^eq\./, "");
            const rows = insertedShipments.filter(
                (row) =>
                    (!id || row.id === id) &&
                    (!externalOrderId || row.external_order_id === externalOrderId) &&
                    (!expeditionNumber || row.expedition_number === expeditionNumber),
            );
            if (url.searchParams.get("order") === "created_at.desc") {
                rows.sort((left, right) => timestamp(right.created_at) - timestamp(left.created_at));
            }
            const projected = projectRows(url, rows.slice(0, Number(url.searchParams.get("limit") ?? rows.length)));
            const eventFields = embeddedFields(fields, "events:shipment_events");
            if (eventFields.length) {
                for (const [index, row] of rows.entries()) {
                    if (!projected[index]) {
                        break;
                    }
                    projected[index]!.events = shipmentEvents
                        .filter((event) => event.shipment_id === row.id)
                        .sort((left, right) => {
                            const occurred = nullableTimestampDescending(left.occurred_at, right.occurred_at);
                            return occurred || timestamp(right.created_at) - timestamp(left.created_at);
                        })
                        .map((event) => projectRecord(event, eventFields));
                }
            }
            return jsonResponse(projected, 200);
        }
        if (url.origin === supabaseUrl && url.pathname === "/rest/v1/rpc/read_tracking_summary" && method === "POST") {
            const body = JSON.parse(requestBody) as JsonRecord;
            const row = insertedShipments.find((shipment) => shipment.expedition_number === body.p_expedition_number);
            if (!row) {
                return jsonResponse([{ shipment: null, events: [] }], 200);
            }
            const events = shipmentEvents
                .filter((event) => event.shipment_id === row.id)
                .sort((left, right) => {
                    const occurred = nullableTimestampDescending(left.occurred_at, right.occurred_at);
                    return occurred || timestamp(right.created_at) - timestamp(left.created_at);
                })
                .map((event) => ({
                    normalized_status: event.normalized_status ?? null,
                    occurred_at: event.occurred_at ?? null,
                    event_label: event.event_label,
                    event_date: event.event_date ?? null,
                    event_time: event.event_time ?? null,
                    location: event.location ?? null,
                }));
            return jsonResponse(
                [
                    {
                        shipment: {
                            id: row.id,
                            status: row.status,
                            latest_event_label: row.latest_event_label ?? null,
                            latest_event_at: row.latest_event_at ?? null,
                        },
                        events,
                    },
                ],
                200,
            );
        }
        if (url.origin === supabaseUrl && url.pathname === "/rest/v1/rpc/claim_due_shipments" && method === "POST") {
            const body = JSON.parse(requestBody) as JsonRecord;
            const workerId = String(body.p_worker_id ?? "");
            const limit = Number(body.p_limit ?? 24);
            expect(workerId.length).toBeGreaterThan(0);
            const due = insertedShipments
                .filter(
                    (row) =>
                        Boolean(row.expedition_number) &&
                        !row.tracking_claimed_at &&
                        !row.tracking_checked_at &&
                        !["collected_by_recipient", "lost", "returned_to_sender", "cancelled"].includes(
                            String(row.status),
                        ),
                )
                .slice(0, limit);
            for (const row of due) {
                Object.assign(row, {
                    tracking_claimed_at: "2026-07-12T11:00:00.000Z",
                    tracking_claimed_by: workerId,
                });
            }
            return jsonResponse(due, 200);
        }
        if (
            url.origin === supabaseUrl &&
            url.pathname === "/rest/v1/rpc/mark_stale_shipment_creations_unknown" &&
            method === "POST"
        ) {
            const limit = Number((JSON.parse(requestBody) as JsonRecord).p_limit ?? 24);
            const rows = insertedShipments
                .filter(
                    (row) =>
                        row.status === "creating" &&
                        Date.parse(String(row.provider_call_started_at ?? "")) <= Date.now() - 20 * 60_000,
                )
                .slice(0, limit);
            for (const row of rows) {
                Object.assign(row, {
                    status: "unknown",
                    creation_manual_review_at: "2026-07-13T12:00:00.000Z",
                    last_error: "shipment creation lease expired before a provider outcome was attached",
                });
            }
            return jsonResponse(rows, 200);
        }
        if (url.origin === supabaseUrl && url.pathname === "/rest/v1/rpc/declare_seller_handoff" && method === "POST") {
            const body = JSON.parse(requestBody) as JsonRecord;
            const actor = String(body.p_seller_cms_user_id ?? "").trim();
            if (!actor) {
                return jsonResponse(
                    {
                        message: "validation: seller CMS user id is required",
                    },
                    400,
                );
            }
            const row = insertedShipments.find(
                (item) => item.external_order_id === body.p_external_order_id && item.seller_cms_user_id === actor,
            );
            if (!row) {
                return jsonResponse(
                    {
                        message: "not_found: shipment not found",
                    },
                    404,
                );
            }
            if (!row.seller_handoff_declared_at) {
                if (row.carrier_accepted_at || row.status !== "label_ready") {
                    return jsonResponse(
                        {
                            message: "conflict: seller handoff cannot be declared for the current shipment state",
                        },
                        409,
                    );
                }
                row.seller_handoff_declared_at = new Date().toISOString();
            }
            return jsonResponse(
                {
                    id: row.id,
                    external_order_id: row.external_order_id,
                    expedition_number: row.expedition_number,
                    status: row.status,
                    carrier_accepted_at: row.carrier_accepted_at,
                    recipient_handoff_at: row.recipient_handoff_at,
                    seller_handoff_declared_at: row.seller_handoff_declared_at,
                },
                200,
            );
        }
        if (
            url.origin === supabaseUrl &&
            url.pathname === "/rest/v1/rpc/cancel_shipment_unscanned" &&
            method === "POST"
        ) {
            const body = JSON.parse(requestBody) as JsonRecord;
            const row = insertedShipments.find((item) => item.external_order_id === body.p_external_order_id);
            if (!row) {
                return jsonResponse({ message: "not_found: shipment" }, 404);
            }
            if (["cancelled_unscanned", "cancelled"].includes(String(row.status))) {
                if (String(body.p_tracking_until ?? "") !== String(row.cancellation_tracking_until ?? "")) {
                    return jsonResponse(
                        { message: "conflict: cancellation replay changed the tracking deadline" },
                        409,
                    );
                }
                return jsonResponse({ ...row, idempotentReplay: true }, 200);
            }
            const trackingUntil = Date.parse(String(body.p_tracking_until ?? ""));
            if (!Number.isFinite(trackingUntil) || trackingUntil <= Date.now()) {
                return jsonResponse(
                    { message: "validation: cancellation tracking deadline must be in the future" },
                    400,
                );
            }
            if (row.tracking_claimed_at && Date.parse(String(row.tracking_claimed_at)) > Date.now() - 20 * 60_000) {
                return jsonResponse({ message: "conflict: active carrier reconciliation prevents cancellation" }, 409);
            }
            if (
                row.seller_handoff_declared_at ||
                row.carrier_accepted_at ||
                !["created", "label_ready", "failed", "cancelled_unscanned", "cancelled"].includes(String(row.status))
            ) {
                return jsonResponse(
                    { message: "conflict: shipment can no longer be cancelled before carrier reconciliation" },
                    409,
                );
            }
            Object.assign(row, {
                status: "cancelled_unscanned",
                cancellation_tracking_until: body.p_tracking_until,
                tracking_next_attempt_at: "2026-07-12T11:00:00.000Z",
                tracking_claimed_at: null,
                tracking_claimed_by: null,
                last_error: null,
            });
            for (const token of labelAccessTokens.filter((item) => item.shipment_id === row.id && !item.revoked_at)) {
                token.revoked_at = "2026-07-12T11:00:00.000Z";
            }
            return jsonResponse({ ...row, idempotentReplay: false }, 200);
        }
        if (url.origin === supabaseUrl && url.pathname === "/rest/v1/shipment_events" && method === "GET") {
            const shipmentId = url.searchParams.get("shipment_id")?.replace(/^eq\./, "");
            const pendingOnly = url.searchParams.get("commerce_projected_at") === "is.null";
            const normalizedOnly = url.searchParams.get("normalized_status") === "not.is.null";
            const projectionStatuses = /^in\.\((.+)\)$/
                .exec(url.searchParams.get("projection_status") ?? "")?.[1]
                ?.split(",");
            return jsonResponse(
                projectRows(
                    url,
                    shipmentEvents.filter(
                        (row) =>
                            (!shipmentId || row.shipment_id === shipmentId) &&
                            (!pendingOnly || !row.commerce_projected_at) &&
                            (!normalizedOnly || Boolean(row.normalized_status)) &&
                            (!projectionStatuses || projectionStatuses.includes(String(row.projection_status))),
                    ),
                ),
                200,
            );
        }
        if (url.origin === supabaseUrl && url.pathname === "/rest/v1/shipment_events" && method === "POST") {
            const rows = JSON.parse(requestBody) as JsonRecord[];
            for (const row of rows) {
                const index = shipmentEvents.findIndex(
                    (item) =>
                        item.shipment_id === row.shipment_id && item.provider_event_key === row.provider_event_key,
                );
                const stored = {
                    projection_status: "pending",
                    projection_attempts: 0,
                    projection_next_attempt_at: "2026-07-12T11:31:00.000Z",
                    projection_claimed_at: null,
                    projection_claimed_by: null,
                    projection_claim_token: null,
                    projection_last_error: null,
                    projection_manual_review_at: null,
                    ...(index >= 0 ? shipmentEvents[index] : {}),
                    ...row,
                    id: index >= 0 ? shipmentEvents[index]?.id : shipmentEvents.length + 1,
                    created_at: "2026-07-12T11:31:00.000Z",
                };
                if (index >= 0) {
                    shipmentEvents[index] = stored;
                } else {
                    shipmentEvents.push(stored);
                }
            }
            return new Response(null, { status: 204 });
        }
        if (
            url.origin === supabaseUrl &&
            url.pathname === "/rest/v1/rpc/claim_pending_shipment_events" &&
            method === "POST"
        ) {
            const body = JSON.parse(requestBody) as JsonRecord;
            const workerId = String(body.p_worker_id ?? "");
            const limit = Number(body.p_limit ?? 12);
            for (const row of shipmentEvents.filter(
                (item) => item.projection_status === "processing" && item.projection_claimed_at === "stale",
            )) {
                const manual = Number(row.projection_attempts ?? 0) >= Number(body.p_max_attempts ?? 5);
                Object.assign(row, {
                    projection_status: manual ? "manual_review" : "retry_wait",
                    projection_claimed_at: null,
                    projection_claimed_by: null,
                    projection_claim_token: null,
                    projection_last_error: "projection lease expired before acknowledgement",
                    projection_manual_review_at: manual ? "2026-07-12T11:32:00.000Z" : null,
                });
            }
            const claimed = shipmentEvents
                .filter(
                    (row) =>
                        Boolean(row.normalized_status) &&
                        !row.commerce_projected_at &&
                        ["pending", "retry_wait"].includes(String(row.projection_status)),
                )
                .slice(0, limit);
            for (const row of claimed) {
                Object.assign(row, {
                    projection_status: "processing",
                    projection_attempts: Number(row.projection_attempts ?? 0) + 1,
                    projection_claimed_at: "2026-07-12T11:32:00.000Z",
                    projection_claimed_by: workerId,
                    projection_claim_token: `00000000-0000-4000-8000-${String(row.id).padStart(6, "0")}${String(Number(row.projection_attempts ?? 0) + 1).padStart(6, "0")}`,
                    projection_last_error: null,
                });
            }
            return jsonResponse(claimed, 200);
        }
        if (
            url.origin === supabaseUrl &&
            url.pathname === "/rest/v1/rpc/complete_shipment_event_projection" &&
            method === "POST"
        ) {
            const body = JSON.parse(requestBody) as JsonRecord;
            const row = shipmentEvents.find(
                (item) =>
                    item.id === body.p_event_id &&
                    item.projection_claim_token === body.p_claim_token &&
                    item.projection_status === "processing",
            );
            if (!row) {
                return jsonResponse(false, 200);
            }
            Object.assign(row, {
                commerce_projected_at: "2026-07-12T11:33:00.000Z",
                projection_status: "projected",
                projection_claimed_at: null,
                projection_claimed_by: null,
                projection_claim_token: null,
                projection_last_error: null,
            });
            return jsonResponse(true, 200);
        }
        if (
            url.origin === supabaseUrl &&
            url.pathname === "/rest/v1/rpc/fail_shipment_event_projection" &&
            method === "POST"
        ) {
            const body = JSON.parse(requestBody) as JsonRecord;
            const row = shipmentEvents.find(
                (item) =>
                    item.id === body.p_event_id &&
                    item.projection_claim_token === body.p_claim_token &&
                    item.projection_status === "processing",
            );
            if (!row) {
                return jsonResponse({ message: "projection lease mismatch" }, 409);
            }
            const manual = Number(row.projection_attempts) >= Number(body.p_max_attempts ?? 5);
            Object.assign(row, {
                projection_status: manual ? "manual_review" : "retry_wait",
                projection_next_attempt_at: "2026-07-12T11:34:00.000Z",
                projection_claimed_at: null,
                projection_claimed_by: null,
                projection_claim_token: null,
                projection_last_error: body.p_error,
                projection_manual_review_at: manual ? "2026-07-12T11:33:00.000Z" : null,
            });
            return jsonResponse(row, 200);
        }
        if (
            url.origin === supabaseUrl &&
            url.pathname === "/rest/v1/rpc/review_shipment_event_projection" &&
            method === "POST"
        ) {
            const body = JSON.parse(requestBody) as JsonRecord;
            const row = shipmentEvents.find((item) => item.id === body.p_event_id);
            if (!row) {
                return jsonResponse({ message: "not_found: shipment event" }, 404);
            }
            if (row.projection_status !== "manual_review") {
                return jsonResponse({ message: "conflict: only a manual-review projection can be reviewed" }, 409);
            }
            if (body.p_action !== "requeue") {
                return jsonResponse({ message: "conflict: no safely projected duplicate exists" }, 409);
            }
            Object.assign(row, {
                projection_status: "retry_wait",
                projection_attempts: 0,
                projection_next_attempt_at: "2026-07-12T11:35:00.000Z",
                projection_claimed_at: null,
                projection_claimed_by: null,
                projection_claim_token: null,
                projection_last_error: `operator requeue: ${String(body.p_reason)}`,
                projection_manual_review_at: null,
            });
            return jsonResponse(row, 200);
        }
        if (url.origin === supabaseUrl && url.pathname === "/rest/v1/shipment_events" && method === "PATCH") {
            const patch = JSON.parse(requestBody) as JsonRecord;
            const orderPublicId = url.searchParams.get("order_public_id")?.replace(/^eq\./, "");
            const providerEventKey = url.searchParams.get("provider_event_key")?.replace(/^eq\./, "");
            const rows = shipmentEvents.filter(
                (row) =>
                    row.order_public_id === orderPublicId &&
                    row.provider_event_key === providerEventKey &&
                    !row.commerce_projected_at,
            );
            for (const row of rows) {
                Object.assign(row, patch);
            }
            return jsonResponse(projectRows(url, rows), 200);
        }
        if (
            url.origin === supabaseUrl &&
            url.pathname === "/rest/v1/rpc/issue_label_access_token" &&
            method === "POST"
        ) {
            const body = JSON.parse(requestBody) as JsonRecord;
            const shipment = insertedShipments.find((item) => item.external_order_id === body.p_external_order_id);
            if (!shipment) {
                return jsonResponse({ message: "not_found: shipment" }, 404);
            }
            if (shipment.seller_cms_user_id !== body.p_seller_cms_user_id) {
                return jsonResponse({ message: "not_found: shipment" }, 404);
            }
            if (shipment.status !== "label_ready" || shipment.carrier_accepted_at) {
                return jsonResponse({ message: "conflict: the shipment label is not available" }, 409);
            }
            const token = {
                token_hash: body.p_token_hash,
                shipment_id: shipment.id,
                seller_cms_user_id: body.p_seller_cms_user_id,
                expires_at: body.p_expires_at,
                created_at: "2026-07-12T11:00:00.000Z",
                revoked_at: null,
            };
            labelAccessTokens.push(token);
            return jsonResponse(token, 200);
        }
        if (
            url.origin === supabaseUrl &&
            url.pathname === "/rest/v1/rpc/get_label_access_context" &&
            method === "POST"
        ) {
            const body = JSON.parse(requestBody) as JsonRecord;
            const token = labelAccessTokens.find(
                (row) => row.token_hash === body.p_token_hash && row.seller_cms_user_id === body.p_seller_cms_user_id,
            );
            if (!token || token.revoked_at) {
                return jsonResponse({ state: "not_found" }, 200);
            }
            if (Date.parse(String(token.expires_at)) <= Date.now()) {
                return jsonResponse({ state: "expired" }, 200);
            }
            const shipment = insertedShipments.find((row) => row.id === token.shipment_id);
            if (
                !shipment ||
                !shipment.label_url ||
                ["cancelled_unscanned", "cancelled", "manual_review"].includes(String(shipment.status))
            ) {
                return jsonResponse({ state: "label_missing" }, 200);
            }
            return jsonResponse(
                {
                    state: "ok",
                    shipment: {
                        expedition_number: shipment.expedition_number,
                        label_url: shipment.label_url,
                    },
                },
                200,
            );
        }
        if (url.origin === supabaseUrl && url.pathname === "/rest/v1/label_access_tokens" && method === "GET") {
            const tokenHash = url.searchParams.get("token_hash")?.replace(/^eq\./, "");
            const seller = url.searchParams.get("seller_cms_user_id")?.replace(/^eq\./, "");
            return jsonResponse(
                projectRows(
                    url,
                    labelAccessTokens.filter(
                        (row) =>
                            (!tokenHash || row.token_hash === tokenHash) &&
                            (!seller || row.seller_cms_user_id === seller),
                    ),
                ),
                200,
            );
        }
        if (url.origin === supabaseUrl && url.pathname === "/rest/v1/shipment_recovery_events" && method === "POST") {
            shipmentRecoveryEvents.push(JSON.parse(requestBody) as JsonRecord);
            return new Response(null, { status: 204 });
        }
        throw new Error(`unexpected fetch: ${method} ${request.url}`);
    };

    return {
        result,
        sources,
        secrets,
        roles,
        dashboards,
        importedBlocs,
        deployment,
        insertedShipments,
        shipmentEvents,
        labelAccessTokens,
        shipmentRecoveryEvents,
        relaySelections,
        deliveryQuotes,
        connectRequestXml: () => connectRequestXml,
        connectRequestCount: () => connectRequestCount,
        connectRequestRedirect: () => connectRequestRedirect,
        trackingRequestXml: () => trackingRequestXml,
        trackingRequestCount: () => trackingRequestCount,
        trackingRequestRedirect: () => trackingRequestRedirect,
        upstreamRequestUrls: () => [...upstreamRequestUrls],
        postgrestRequests: () => postgrestRequests.map((request) => ({ ...request })),
        providerRequests: () => providerRequests.map((request) => ({ ...request })),
        fetchTimeline: () => fetchTimeline.map((step) => ({ ...step })),
        resetRequestHistory() {
            postgrestRequests.length = 0;
            providerRequests.length = 0;
            fetchTimeline.length = 0;
        },
        relayLookupUrl: () => relayLookupUrl,
        async edgeRequest(request: Request): Promise<Response> {
            return await handler(request);
        },
        settingsRow: () => settingRow,
        async sourceFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
            try {
                const request = requestFromFetchInput(input, init);
                if (!request.url.startsWith(`${functionsBaseUrl}/cms-delivery/`)) {
                    throw new Error(`unexpected source proxy fetch: ${request.method} ${request.url}`);
                }
                return await handler(request);
            } catch (error) {
                return new Response(error instanceof Error ? (error.stack ?? error.message) : String(error), {
                    status: 599,
                });
            }
        },
        async resolveSecret(ref: string): Promise<string | undefined> {
            const key = secretRefToKey(ref) ?? ref;
            return (await secrets.get(key)) ?? undefined;
        },
    };
}

export function requestFromFetchInput(input: RequestInfo | URL, init?: RequestInit): Request {
    if (input instanceof Request && !init) {
        return input;
    }
    return new Request(input instanceof Request ? input.url : String(input), {
        method: init?.method ?? (input instanceof Request ? input.method : undefined),
        headers: init?.headers ?? (input instanceof Request ? input.headers : undefined),
        body: init?.body ?? (input instanceof Request ? input.body : undefined),
        redirect: init?.redirect,
    });
}

export function observeFetchRequest(
    request: Request,
    url: URL,
    method: string,
    requestBody: string,
): ObservedFetchRequest {
    const observed: ObservedFetchRequest = {
        method,
        url: request.url,
        pathname: url.pathname,
        searchParams: Object.fromEntries(url.searchParams),
    };
    if (!requestBody) {
        return observed;
    }
    try {
        observed.body = JSON.parse(requestBody) as unknown;
    } catch {
        observed.body = requestBody;
    }
    return observed;
}

export async function relayPoints(
    harness: {
        sources: SourceRepository;
        sourceFetch: typeof fetch;
        resolveSecret: (ref: string) => Promise<string | undefined>;
    },
    params: Record<string, string>,
): Promise<Response> {
    const url = new URL(`http://cms.local${sourcePrefix}delivery/relayPoints`);
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    return await handleSourceRequest(harness.sources, new Request(url), {
        prefix: sourcePrefix,
        deps: {
            fetchImpl: harness.sourceFetch,
            resolveSecret: harness.resolveSecret,
            resolveContext: async () => ({ userID: "user-123" }),
            responseProjectionMode: "strict",
        },
    });
}

export async function createShipment(
    harness: {
        sources: SourceRepository;
        sourceFetch: typeof fetch;
        resolveSecret: (ref: string) => Promise<string | undefined>;
    },
    body: JsonRecord,
): Promise<Response> {
    return await handleSourceRequest(
        harness.sources,
        new Request(`http://cms.local${sourcePrefix}delivery/createShipment`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }),
        {
            prefix: sourcePrefix,
            deps: {
                fetchImpl: harness.sourceFetch,
                resolveSecret: harness.resolveSecret,
                resolveContext: async () => ({ userID: "user-123" }),
                responseProjectionMode: "strict",
            },
        },
    );
}

export async function edgeCreateShipment(
    harness: {
        edgeRequest(request: Request): Promise<Response>;
    },
    body: JsonRecord,
): Promise<Response> {
    return await harness.edgeRequest(
        new Request(`${functionsBaseUrl}/cms-delivery/shipments`, {
            method: "POST",
            headers: {
                authorization: `Bearer ${activeEnv.CMS_DELIVERY_API_KEY}`,
                "content-type": "application/json",
                "x-cms-user-id": "user-123",
            },
            body: JSON.stringify(body),
        }),
    );
}

export async function edgeTracking(
    harness: {
        edgeRequest(request: Request): Promise<Response>;
    },
    expeditionNumber: string,
): Promise<Response> {
    const url = new URL(`${functionsBaseUrl}/cms-delivery/tracking`);
    url.searchParams.set("expeditionNumber", expeditionNumber);
    return await harness.edgeRequest(
        new Request(url, {
            headers: { authorization: `Bearer ${activeEnv.CMS_DELIVERY_API_KEY}` },
        }),
    );
}

export async function sourceRequest(
    harness: {
        sources: SourceRepository;
        sourceFetch: typeof fetch;
        resolveSecret: (ref: string) => Promise<string | undefined>;
    },
    endpoint: string,
    options: {
        method: "GET" | "POST";
        userId: string;
        userRole?: string;
        enforceAccess?: boolean;
        responseProjectionMode?: "strict" | "compatibility";
        params?: Record<string, string>;
        body?: JsonRecord;
    },
): Promise<Response> {
    const url = new URL(`http://cms.local${sourcePrefix}delivery/${endpoint}`);
    for (const [key, value] of Object.entries(options.params ?? {})) {
        url.searchParams.set(key, value);
    }
    return await handleSourceRequest(
        harness.sources,
        new Request(url, {
            method: options.method,
            headers: options.body ? { "content-type": "application/json" } : undefined,
            body: options.body ? JSON.stringify(options.body) : undefined,
        }),
        {
            prefix: sourcePrefix,
            deps: {
                fetchImpl: harness.sourceFetch,
                resolveSecret: harness.resolveSecret,
                authorizeEndpoint: options.enforceAccess
                    ? (endpoint) => {
                          if (!options.userId) {
                              return { authorized: false, status: 401 };
                          }
                          const callerMode =
                              options.userRole === "system"
                                  ? "system"
                                  : options.userRole === "admin"
                                    ? "admin"
                                    : "auth";
                          return sourceEndpointAccessAllows(sourceEndpointAccessMode(endpoint), callerMode)
                              ? true
                              : { authorized: false, status: 403 };
                      }
                    : undefined,
                resolveContext: async () => ({
                    userID: options.userId,
                    userRole: options.userRole ?? "admin",
                }),
                responseProjectionMode: options.responseProjectionMode ?? "strict",
            },
        },
    );
}

export async function tracking(
    harness: {
        sources: SourceRepository;
        sourceFetch: typeof fetch;
        resolveSecret: (ref: string) => Promise<string | undefined>;
    },
    expeditionNumber: string,
): Promise<Response> {
    const url = new URL(`http://cms.local${sourcePrefix}delivery/tracking`);
    url.searchParams.set("expeditionNumber", expeditionNumber);
    return await handleSourceRequest(harness.sources, new Request(url), {
        prefix: sourcePrefix,
        deps: {
            fetchImpl: harness.sourceFetch,
            resolveSecret: harness.resolveSecret,
            resolveContext: async () => ({ userID: "user-123" }),
        },
    });
}

export async function saveRelaySelection(
    harness: {
        sources: SourceRepository;
        sourceFetch: typeof fetch;
        resolveSecret: (ref: string) => Promise<string | undefined>;
    },
    body: JsonRecord,
): Promise<Response> {
    return await handleSourceRequest(
        harness.sources,
        new Request(`http://cms.local${sourcePrefix}delivery/saveRelaySelection`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }),
        {
            prefix: sourcePrefix,
            deps: {
                fetchImpl: harness.sourceFetch,
                resolveSecret: harness.resolveSecret,
                resolveContext: async () => ({ userID: "user-123" }),
            },
        },
    );
}

export async function relaySelection(
    harness: {
        sources: SourceRepository;
        sourceFetch: typeof fetch;
        resolveSecret: (ref: string) => Promise<string | undefined>;
    },
    externalOrderId: string,
): Promise<Response> {
    const url = new URL(`http://cms.local${sourcePrefix}delivery/relaySelection`);
    url.searchParams.set("externalOrderId", externalOrderId);
    return await handleSourceRequest(harness.sources, new Request(url), {
        prefix: sourcePrefix,
        deps: {
            fetchImpl: harness.sourceFetch,
            resolveSecret: harness.resolveSecret,
            resolveContext: async () => ({ userID: "user-123" }),
        },
    });
}

export async function setSettings(
    harness: {
        sources: SourceRepository;
        sourceFetch: typeof fetch;
        resolveSecret: (ref: string) => Promise<string | undefined>;
    },
    body: JsonRecord,
): Promise<Response> {
    return await handleSourceRequest(
        harness.sources,
        new Request(`http://cms.local${sourcePrefix}delivery/setSettings?id=default`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }),
        {
            prefix: sourcePrefix,
            deps: {
                fetchImpl: harness.sourceFetch,
                resolveSecret: harness.resolveSecret,
                resolveContext: async () => ({ userID: "user-123" }),
            },
        },
    );
}

export async function loadEdgeHandler(): Promise<EdgeHandler> {
    if (!edgeHandler) {
        await import(edgeFunctionUrl);
    }
    if (!edgeHandler) {
        throw new Error("cms-delivery edge handler was not registered");
    }
    return edgeHandler;
}

export function definition(): IntegrationDefinition {
    return JSON.parse(readFileSync(definitionUrl, "utf8")) as IntegrationDefinition;
}

export function createShipmentField(createForm: JsonRecord | undefined, fieldId: string): JsonRecord | undefined {
    const sections = [...arrayValue(createForm?.main), ...arrayValue(createForm?.aside)];
    return sections
        .flatMap((section) => arrayValue((section as JsonRecord).fields))
        .find((field): field is JsonRecord => (field as JsonRecord).id === fieldId);
}

export function arrayValue(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

export function integrationAnswers(): Record<string, string> {
    return {
        id: "delivery",
        mondialRelayConnectEndpoint: connectEndpoint,
        mondialRelayConnectLogin: "connect-login",
        mondialRelayConnectPassword: "connect-password",
        mondialRelayConnectCustomerId: "TTMRSDBX",
        mondialRelayTrackingEndpoint: trackingEndpoint,
        mondialRelayTrackingBrand: "BDTEST",
        mondialRelayTrackingPrivateKey: "tracking-private-key",
    };
}

export function defaultSettingsRow(): JsonRecord {
    return {
        id: "default",
        mode_collection: "CCC",
        mode_delivery: "24R",
        sender_name: "Sender Shop",
        sender_firstname: "",
        sender_lastname: "",
        sender_address_line1: "1 Rue Test",
        sender_address_line2: "",
        sender_address_line3: "",
        sender_postal_code: "75001",
        sender_city: "Paris",
        sender_country: "FR",
        sender_phone: "0600000000",
        sender_mobile: "",
        sender_email: "sender@example.test",
        default_weight_grams: 500,
        default_package_count: 1,
        default_length_cm: 30,
        default_width_cm: 20,
        default_height_cm: 10,
        default_content: "Products",
        declared_currency: "EUR",
        connect_culture: "fr-FR",
        connect_version_api: "1.0",
        connect_output_format: "10x15",
        connect_output_type: "PdfUrl",
        created_at: "2026-07-02T09:00:00.000Z",
        updated_at: "2026-07-02T09:00:00.000Z",
    };
}

export function validShipmentBody(): JsonRecord {
    return {
        externalOrderId: "order-1001",
        sellerCmsUserId: "seller-42",
        deliveryQuoteId: `mrq_${"a".repeat(64)}`,
        quoteExternalOrderId: "order-1001",
        quotePurpose: "fulfillment",
        selectedForCmsUserId: "user-123",
        modeCollection: "CCC",
        modeDelivery: "24R",
        recipientName: "Client Test",
        recipientEmail: "recipient@example.test",
        recipientPhone: "0600000000",
        recipientAddressLine1: "17B Chemin du Fond du Val",
        recipientPostalCode: "76930",
        recipientCity: "Octeville-sur-Mer",
        recipientCountry: "FR",
        deliveryRelayLocation: "FR-031270",
        weightGrams: 500,
        packageCount: 1,
        lengthCm: 30,
        widthCm: 20,
        heightCm: 10,
        content: "Books",
        declaredValueMinorAmount: 12_345,
        declaredCurrency: "EUR",
    };
}

export function inProgressShipment(providerCallStartedAt: string): JsonRecord {
    return {
        id: "shipment-stale-replay",
        external_order_id: "order-1001",
        idempotency_key: "order-1001",
        status: "creating",
        provider_call_started_at: providerCallStartedAt,
        creation_manual_review_at: null,
        raw_request: validShipmentBody(),
        created_at: "2020-01-01T00:00:00.000Z",
        updated_at: "2020-01-01T00:00:00.000Z",
    };
}

export function validDeliveryQuoteRequest(externalOrderId: string): JsonRecord {
    return {
        requestKey: `quote-request:${externalOrderId}:1:FR-034439`,
        orderVersion: 1,
        selectedForCmsUserId: "user-123",
        currency: "eur",
        merchandiseSubtotalMinorAmount: 12_345,
        recipientSnapshot: {
            recipient: "Client Test",
            phone: "+33600000000",
            addressLine1: "17B Chemin du Fond du Val",
            addressLine2: "",
            addressLine3: "",
            postalCode: "76930",
            city: "Octeville-sur-Mer",
            countryCode: "FR",
            email: "recipient@example.test",
        },
        sellerFulfillmentSnapshot: {
            givenName: "Sender",
            surname: "Shop",
            phone: "+33600000000",
            addressLine1: "1 Rue Test",
            addressLine2: "",
            addressLine3: "",
            postalCode: "75001",
            city: "Paris",
            countryCode: "FR",
            email: "sender@example.test",
        },
    };
}

export function defaultDeliveryQuoteRow(): JsonRecord {
    return {
        quote_id: `mrq_${"a".repeat(64)}`,
        request_key: "default-order-1001-quote",
        external_order_id: "order-1001",
        order_version: 1,
        revision: 1,
        selected_by: "user-123",
        selected_for_cms_user_id: "user-123",
        relay_location: "FR-031270",
        relay_country: "FR",
        relay_number: "031270",
        relay_name: "POINT RELAIS TEST",
        relay_address_line1: "1 Rue Relais",
        relay_address_line2: "",
        relay_postal_code: "76930",
        relay_city: "OCTEVILLE-SUR-MER",
        relay_latitude: 49.5,
        relay_longitude: 0.1,
        weight_grams: 500,
        shipping_amount: 450,
        currency: "eur",
        merchandise_subtotal_minor_amount: 12_345,
        recipient_snapshot: {
            name: "Client Test",
            firstName: "Client",
            lastName: "Test",
            phone: "+33600000000",
            addressLine1: "17B Chemin du Fond du Val",
            addressLine2: "",
            addressLine3: "",
            postalCode: "76930",
            city: "Octeville-sur-Mer",
            country: "FR",
            email: "recipient@example.test",
        },
        seller_fulfillment_snapshot: {
            name: "Sender Shop",
            firstName: "Sender",
            lastName: "Shop",
            phone: "+33600000000",
            addressLine1: "1 Rue Test",
            addressLine2: "",
            addressLine3: "",
            postalCode: "75001",
            city: "Paris",
            country: "FR",
            email: "sender@example.test",
        },
        relay_snapshot: { nature: "1", pointType: "relay_point" },
        request_snapshot: {},
        quoted_at: "2026-07-13T10:00:00.000Z",
        expires_at: "2099-07-13T10:15:00.000Z",
        created_at: "2026-07-13T10:00:00.000Z",
    };
}

export function connectShipmentResponse(options: {
    connectStatusCode?: string;
    connectStatusLevel?: string;
    connectStatusMessage?: string;
    labelUrl?: string;
}): string {
    const code = options.connectStatusCode ?? "0";
    const level = options.connectStatusLevel ?? "Info";
    const message = options.connectStatusMessage ?? "Success";
    if (level === "Error" || level === "Critical") {
        return `<?xml version="1.0" encoding="utf-8"?>
<ShipmentCreationResponse xmlns="http://www.example.org/Response">
  <StatusList>
    <Status Code="${xmlEscape(code)}" Level="${xmlEscape(level)}" Message="${xmlEscape(message)}" />
  </StatusList>
</ShipmentCreationResponse>`;
    }
    return `<?xml version="1.0" encoding="utf-8"?>
<ShipmentCreationResponse xmlns="http://www.example.org/Response">
  <ShipmentsList>
    <Shipment ShipmentNumber="00435394">
      <LabelList>
        <Label>
          <LabelValues Key="ModeSandbox" Value="True" />
          <Output>${xmlEscape(options.labelUrl ?? "https://connect-sandbox.mondialrelay.com/labels/00435394.pdf")}</Output>
        </Label>
      </LabelList>
    </Shipment>
  </ShipmentsList>
  <StatusList>
    <Status Code="${xmlEscape(code)}" Level="${xmlEscape(level)}" Message="${xmlEscape(message)}" />
  </StatusList>
</ShipmentCreationResponse>`;
}

export function trackingResponse(eventLabel = "Livré", statusCode = "82"): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI2_TracingColisDetailleResponse xmlns="http://www.mondialrelay.fr/webservice/">
      <WSI2_TracingColisDetailleResult>
        <STAT>${xmlEscape(statusCode)}</STAT>
        <Libelle01>Colis livré</Libelle01>
        <Libelle02>au destinataire</Libelle02>
        <Tracing>
          <Libelle>${xmlEscape(eventLabel)}</Libelle>
          <Date>12/07/2026</Date>
          <Heure>11:30</Heure>
          <Emplacement>PARIS</Emplacement>
          <Relais_Num>024474</Relais_Num>
          <Relais_Pays>FR</Relais_Pays>
        </Tracing>
      </WSI2_TracingColisDetailleResult>
    </WSI2_TracingColisDetailleResponse>
  </soap:Body>
</soap:Envelope>`;
}

export function widgetRelayLookupResponse(): string {
    return `cmsRelayPoints({
  "Error": null,
  "PRList": [
    {
      "Adresse1": "38 RUE MAUCONSEIL",
      "Adresse2": "",
      "Available": true,
      "CP": "75001",
      "HoursHtmlTable": "",
      "ID": "034439",
      "Lat": "48,8641433",
      "Long": "2,3470309",
      "Nature": "1",
      "Nom": "ARS INFORMATIQUE",
      "Pays": "FR",
      "Photo": null,
      "Ville": "PARIS",
      "Warning": ""
    },
    {
      "Adresse1": "85 BIS RUE REAUMUR",
      "Adresse2": "",
      "Available": true,
      "CP": "75002",
      "HoursHtmlTable": "",
      "ID": "024474",
      "Lat": "48,866999",
      "Long": "2,347949",
      "Nature": "C",
      "Nom": "LOCKER G20 RUE REAUMUR",
      "Pays": "FR",
      "Photo": null,
      "Ville": "PARIS",
      "Warning": ""
    }
  ]
});`;
}

export function jsonResponse(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: { "content-type": "application/json; charset=utf-8" },
    });
}

export function projectRows(url: URL, rows: JsonRecord[]): JsonRecord[] {
    const fields = selectedFields(url);
    if (!fields.length || fields.includes("*")) {
        return rows;
    }
    return rows.map((row) => projectRecord(row, fields));
}

export function projectRecord(row: JsonRecord, fields: string[]): JsonRecord {
    return Object.fromEntries(fields.filter((field) => Object.hasOwn(row, field)).map((field) => [field, row[field]]));
}

export function selectedFields(url: URL): string[] {
    return splitSelectFields(url.searchParams.get("select") ?? "");
}

export function splitSelectFields(select: string): string[] {
    const fields: string[] = [];
    let start = 0;
    let depth = 0;
    for (let index = 0; index < select.length; index += 1) {
        if (select[index] === "(") {
            depth += 1;
        } else if (select[index] === ")") {
            depth -= 1;
        } else if (select[index] === "," && depth === 0) {
            fields.push(select.slice(start, index).trim());
            start = index + 1;
        }
    }
    fields.push(select.slice(start).trim());
    return fields.filter(Boolean);
}

export function embeddedFields(fields: string[], prefix: string): string[] {
    const field = fields.find((candidate) => candidate.startsWith(`${prefix}!`) || candidate.startsWith(`${prefix}(`));
    if (!field) {
        return [];
    }
    const open = field.indexOf("(");
    return open < 0 ? [] : splitSelectFields(field.slice(open + 1, -1));
}

export function stableJson(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(stableJson).join(",")}]`;
    }
    if (value && typeof value === "object") {
        const entries = Object.entries(value as JsonRecord).sort(([left], [right]) => left.localeCompare(right));
        return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}

export function shipmentReservationError(
    request: JsonRecord,
    deliveryQuotes: JsonRecord[],
    relaySelections: JsonRecord[],
): string | null {
    const reservation = request.p_reservation as JsonRecord;
    const check = request.p_quote_check as JsonRecord;
    const externalOrderId = String(check.externalOrderId ?? "");
    const quoteId = String(reservation.delivery_quote_id ?? "");
    const quotePurpose = String(request.p_quote_purpose ?? "");
    const quoteExternalOrderId = String(request.p_quote_external_order_id ?? "");
    const selectedFor = String(request.p_selected_for_cms_user_id ?? "");
    const quote = deliveryQuotes.find((row) => row.quote_id === quoteId);
    if (!externalOrderId.startsWith("claim-return:") && !quote) {
        return "an exact immutable delivery quote is required before shipment creation";
    }
    if (
        quoteId &&
        (!quote || quote.external_order_id !== quoteExternalOrderId || quote.selected_for_cms_user_id !== selectedFor)
    ) {
        return "shipment delivery quote binding is invalid";
    }
    if (quote) {
        const mainFulfillment = quotePurpose === "fulfillment";
        if (mainFulfillment && quoteExternalOrderId !== externalOrderId) {
            return "main shipment delivery quote belongs to another order";
        }
        if (
            mainFulfillment &&
            (quote.relay_location !== check.deliveryRelayLocation ||
                quote.weight_grams !== check.weightGrams ||
                quote.merchandise_subtotal_minor_amount !== check.declaredValueMinorAmount ||
                String(quote.currency).toUpperCase() !== check.declaredCurrency)
        ) {
            return "shipment financial or relay input does not match the immutable quote";
        }
        const expectedSender =
            quotePurpose === "claim_return" ? quote.recipient_snapshot : quote.seller_fulfillment_snapshot;
        const expectedRecipient =
            quotePurpose === "claim_return" ? quote.seller_fulfillment_snapshot : quote.recipient_snapshot;
        if (!sameTestAddress(check.sender, expectedSender) || !sameTestAddress(check.recipient, expectedRecipient)) {
            return "shipment address input does not match the immutable quote snapshot";
        }
    } else {
        const selection = relaySelections.find((row) => row.external_order_id === externalOrderId);
        if (selection && String(selection.relay_location) !== check.deliveryRelayLocation) {
            return "shipment relay does not match the immutable server selection";
        }
    }
    return null;
}

export function sameTestAddress(actual: unknown, expected: unknown): boolean {
    if (
        !actual ||
        typeof actual !== "object" ||
        Array.isArray(actual) ||
        !expected ||
        typeof expected !== "object" ||
        Array.isArray(expected)
    ) {
        return false;
    }
    const left = actual as JsonRecord;
    const right = expected as JsonRecord;
    return [
        "name",
        "firstName",
        "lastName",
        "phone",
        "addressLine1",
        "addressLine2",
        "addressLine3",
        "postalCode",
        "city",
        "country",
        "email",
    ].every((field) => String(left[field] ?? "").trim() === String(right[field] ?? "").trim());
}

export function nullableTimestampDescending(left: unknown, right: unknown): number {
    const leftMissing = left === null || left === undefined || left === "";
    const rightMissing = right === null || right === undefined || right === "";
    if (leftMissing) {
        return rightMissing ? 0 : 1;
    }
    if (rightMissing) {
        return -1;
    }
    return timestamp(right) - timestamp(left);
}

export function timestamp(value: unknown): number {
    const parsed = Date.parse(String(value ?? ""));
    return Number.isFinite(parsed) ? parsed : 0;
}

export function jsonpResponse(value: string, status = 200): Response {
    return new Response(value, {
        status,
        headers: { "content-type": "application/javascript; charset=utf-8" },
    });
}

export async function jsonBody(response: Response): Promise<JsonRecord> {
    const text = await response.text();
    try {
        return JSON.parse(text) as JsonRecord;
    } catch {
        throw new Error(`expected JSON response, got ${response.status}: ${text}`);
    }
}

export function xmlResponse(value: string, status = 200): Response {
    return new Response(value, {
        status,
        headers: { "content-type": "application/xml; charset=utf-8" },
    });
}

export function xmlEscape(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}
