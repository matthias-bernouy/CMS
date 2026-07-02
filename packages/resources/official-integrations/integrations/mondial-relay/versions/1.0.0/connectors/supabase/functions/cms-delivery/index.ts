import { createConnectShipment } from "./connect.ts";
import { envDefault, envText, printableAscii } from "./env.ts";
import {
    handleError,
    HttpError,
    json,
    limitParam,
    offsetParam,
    optionsResponse,
    queryText,
    readJsonObject,
    requireCmsRequest,
    requireCmsWriteRequest,
    requiredQuery,
    routePath,
} from "./http.ts";
import { normalizePhone, shipmentPayload, stringValue } from "./payload.ts";
import { relayPointsFromUrl } from "./relay.ts";
import {
    camelizeRecord,
    insertShipment,
    settingsRow,
    upsertSettingsRow,
    shipmentEvents,
    shipmentRowByExpedition,
    shipmentRowById,
    shipmentsRows,
    shipmentSelect,
} from "./supabase.ts";
import type { DeliverySettings, JsonRecord } from "./types.ts";

Deno.serve(async (request) => {
    try {
        if (request.method === "OPTIONS") return optionsResponse();

        const route = routePath(request);
        if (request.method === "GET" && route === "/health") return health(request);
        if (request.method === "GET" && route === "/shipments") return await shipments(request);
        if (request.method === "GET" && route === "/shipment") return await shipment(request);
        if (request.method === "POST" && route === "/shipments") return await createShipment(request);
        if (request.method === "GET" && route === "/settings") return await settings(request);
        if (request.method === "POST" && route === "/settings") return await setSettings(request);
        if (request.method === "GET" && route === "/relay-points") return await relayPoints(request);
        if (request.method === "GET" && route === "/label") return await label(request);
        if (request.method === "GET" && route === "/tracking") return await tracking(request);
        if (request.method === "GET" && route === "/parse-tracking-link") return await parseTrackingLink(request);

        return json({ error: "not found" }, 404);
    } catch (error) {
        return handleError(error);
    }
});

function health(request: Request): Response {
    requireCmsRequest(request);
    const password = envText("MONDIAL_RELAY_CONNECT_PASSWORD");
    return json({
        ok: true,
        mondialRelay: {
            api: "connect-v2",
            endpoint: connectEndpoint(),
            loginConfigured: envText("MONDIAL_RELAY_CONNECT_LOGIN").length > 0,
            customerId: envText("MONDIAL_RELAY_CONNECT_CUSTOMER_ID"),
            passwordConfigured: password.length > 0,
            passwordLength: password.length,
            passwordPrintableAscii: printableAscii(password),
            widgetBrand: envDefault("MONDIAL_RELAY_WIDGET_BRAND", envText("MONDIAL_RELAY_CONNECT_CUSTOMER_ID")),
            settingsSchema: "delivery",
            settingsTable: "settings",
        },
    });
}

async function shipments(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const limit = limitParam(url, 50);
    const offset = offsetParam(url);
    const filters = [
        `select=${encodeURIComponent(shipmentSelect())}`,
        `order=${encodeURIComponent("created_at.desc")}`,
        `limit=${limit}`,
        `offset=${offset}`,
    ];
    appendEqualFilter(filters, "status", queryText(url, "status"));
    appendEqualFilter(filters, "external_order_id", queryText(url, "externalOrderId"));
    const q = queryText(url, "q");
    if (q) {
        const value = q.replace(/[,*()]/g, " ").trim();
        if (value) {
            filters.push(`or=${encodeURIComponent([
                `recipient_name.ilike.*${value}*`,
                `recipient_city.ilike.*${value}*`,
                `expedition_number.ilike.*${value}*`,
                `external_order_id.ilike.*${value}*`,
            ].join(","))}`);
        }
    }
    const rows = await shipmentsRows(filters.join("&"));
    return json({ items: rows.map(toShipmentJson), limit, offset });
}

async function shipment(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const row = await shipmentByRequest(url);
    if (!row) throw new HttpError(404, "shipment not found");
    const events = await shipmentEvents(String(row.id));
    return json({
        ...toShipmentJson(row),
        events: events.map(camelizeRecord),
    });
}

async function createShipment(request: Request): Promise<Response> {
    requireCmsWriteRequest(request);
    const body = await readJsonObject(request);
    const payload = shipmentPayload(body, settingsFromRow(await settingsRow()));
    const result = await createConnectShipment(payload);
    const row = await insertShipment({
        id: payload.id,
        external_order_id: payload.externalOrderId || undefined,
        expedition_number: result.expeditionNumber,
        tracking_number: result.expeditionNumber,
        status: result.labelUrl ? "label_ready" : "created",
        label_url: result.labelUrl || undefined,
        label_format: payload.connectOutputFormat,
        tracking_url: trackingUrl(result.expeditionNumber, payload.recipient.postalCode),
        mode_collection: payload.modeCollection,
        mode_delivery: payload.modeDelivery,
        delivery_relay_country: payload.deliveryRelayCountry,
        delivery_relay_number: payload.deliveryRelayLocation,
        sender_name: payload.sender.name,
        sender_email: payload.sender.email || undefined,
        sender_phone: payload.sender.phone || payload.sender.mobile || undefined,
        sender_address_line1: payload.sender.addressLine1,
        sender_address_line2: payload.sender.addressLine2 || undefined,
        sender_address_line3: payload.sender.addressLine3 || undefined,
        sender_postal_code: payload.sender.postalCode,
        sender_city: payload.sender.city,
        sender_country: payload.sender.country,
        recipient_name: payload.recipient.name,
        recipient_email: payload.recipient.email || undefined,
        recipient_phone: payload.recipient.phone || payload.recipient.mobile || undefined,
        recipient_address_line1: payload.recipient.addressLine1,
        recipient_address_line2: payload.recipient.addressLine2 || undefined,
        recipient_address_line3: payload.recipient.addressLine3 || undefined,
        recipient_postal_code: payload.recipient.postalCode,
        recipient_city: payload.recipient.city,
        recipient_country: payload.recipient.country,
        weight_grams: payload.weightGrams,
        package_count: payload.packageCount,
        length_cm: payload.lengthCm,
        instructions: payload.instructions || undefined,
        metadata: payload.metadata,
        raw_request: payload.raw,
        raw_response: result.raw,
        created_by: request.headers.get("x-cms-user-id")?.trim() || undefined,
    });

    return json({
        ok: true,
        id: row.id,
        expeditionNumber: result.expeditionNumber,
        labelUrl: result.labelUrl,
        trackingUrl: row.tracking_url,
        status: row.status,
    }, 201);
}

async function settings(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const id = queryText(url, "id");
    const row = await settingsRow(id || "default");
    const settings = settingsJson(row);
    if (id) return json(settings);
    return json({ items: [settings] });
}

async function setSettings(request: Request): Promise<Response> {
    requireCmsWriteRequest(request);
    const body = await readJsonObject(request);
    const patch = settingsRowFromBody(body);
    if (!Object.keys(patch).length) throw new HttpError(400, "settings payload is empty");
    const row = await upsertSettingsRow(patch);
    return json(settingsJson(row));
}

async function relayPoints(request: Request): Promise<Response> {
    requireCmsRequest(request);
    return json({ items: await relayPointsFromUrl(new URL(request.url)) });
}

async function label(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const expeditionNumber = requiredQuery(url, "expeditionNumber");
    const row = await shipmentRowByExpedition(expeditionNumber);
    const labelUrl = typeof row?.label_url === "string" ? row.label_url : "";
    if (!labelUrl) throw new HttpError(404, "label not found");
    const upstream = await fetch(labelUrl, { redirect: "follow" });
    if (!upstream.ok || !upstream.body) throw new HttpError(502, "unable to fetch Mondial Relay label");
    return new Response(upstream.body, {
        status: 200,
        headers: {
            "content-type": upstream.headers.get("content-type") ?? "application/pdf",
            "cache-control": "private, max-age=300",
        },
    });
}

async function tracking(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const expeditionNumber = requiredQuery(url, "expeditionNumber");
    const row = await shipmentRowByExpedition(expeditionNumber);
    if (!row) throw new HttpError(404, "shipment not found");
    const events = await shipmentEvents(String(row.id));
    return json({
        expeditionNumber,
        status: row.status ?? "created",
        latestEventLabel: row.latest_event_label ?? "",
        latestEventAt: row.latest_event_at ?? "",
        events: events.map(camelizeRecord),
    });
}

async function parseTrackingLink(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const link = requiredQuery(url, "url");
    const parsed = parseMondialRelayTrackingLink(link);
    if (!parsed.expeditionNumber) throw new HttpError(400, "unable to extract Mondial Relay expedition number");
    return json({ ...parsed, tracking: await trackingSummary(parsed.expeditionNumber) });
}

async function trackingSummary(expeditionNumber: string): Promise<JsonRecord> {
    const row = await shipmentRowByExpedition(expeditionNumber);
    if (!row) return { expeditionNumber, status: "unknown", events: [] };
    return {
        expeditionNumber,
        status: row.status ?? "created",
        latestEventLabel: row.latest_event_label ?? "",
        latestEventAt: row.latest_event_at ?? "",
        events: await shipmentEvents(String(row.id)),
    };
}

function toShipmentJson(row: JsonRecord): JsonRecord {
    const out = camelizeRecord(row);
    if (typeof out.deliveryRelayNumber === "string") out.deliveryRelayLocation = out.deliveryRelayNumber;
    return out;
}

function settingsJson(row: JsonRecord | null): JsonRecord {
    const settings = settingsFromRow(row);
    return {
        id: settings.id,
        modeCollection: settings.modeCollection,
        modeDelivery: settings.modeDelivery,
        senderName: settings.sender.name,
        senderFirstName: settings.sender.firstName,
        senderLastName: settings.sender.lastName,
        senderAddressLine1: settings.sender.addressLine1,
        senderAddressLine2: settings.sender.addressLine2,
        senderAddressLine3: settings.sender.addressLine3,
        senderPostalCode: settings.sender.postalCode,
        senderCity: settings.sender.city,
        senderCountry: settings.sender.country,
        senderPhone: settings.sender.phone,
        senderMobile: settings.sender.mobile,
        senderEmail: settings.sender.email,
        defaultWeightGrams: settings.defaultWeightGrams,
        defaultPackageCount: settings.defaultPackageCount,
        defaultLengthCm: settings.defaultLengthCm,
        defaultWidthCm: settings.defaultWidthCm,
        defaultHeightCm: settings.defaultHeightCm,
        defaultContent: settings.defaultContent,
        declaredCurrency: settings.declaredCurrency,
        connectCulture: settings.connectCulture,
        connectVersionApi: settings.connectVersionApi,
        connectOutputFormat: settings.connectOutputFormat,
        connectOutputType: settings.connectOutputType,
        createdAt: stringValue(row?.created_at),
        updatedAt: stringValue(row?.updated_at),
    };
}

function settingsFromRow(row: JsonRecord | null): DeliverySettings {
    return {
        id: rowText(row, "id", "default"),
        modeCollection: rowText(row, "mode_collection", "CCC").toUpperCase(),
        modeDelivery: rowText(row, "mode_delivery", "24R").toUpperCase(),
        sender: {
            name: rowText(row, "sender_name", ""),
            firstName: rowText(row, "sender_firstname", ""),
            lastName: rowText(row, "sender_lastname", ""),
            addressLine1: rowText(row, "sender_address_line1", ""),
            addressLine2: rowText(row, "sender_address_line2", ""),
            addressLine3: rowText(row, "sender_address_line3", ""),
            city: rowText(row, "sender_city", ""),
            postalCode: rowText(row, "sender_postal_code", ""),
            country: rowText(row, "sender_country", "FR").toUpperCase(),
            phone: rowText(row, "sender_phone", ""),
            mobile: rowText(row, "sender_mobile", ""),
            email: rowText(row, "sender_email", ""),
        },
        defaultWeightGrams: rowInteger(row, "default_weight_grams", 500),
        defaultPackageCount: rowInteger(row, "default_package_count", 1),
        defaultLengthCm: rowInteger(row, "default_length_cm", 30),
        defaultWidthCm: rowInteger(row, "default_width_cm", 20),
        defaultHeightCm: rowInteger(row, "default_height_cm", 10),
        defaultContent: rowText(row, "default_content", "Products"),
        declaredCurrency: rowText(row, "declared_currency", "EUR").toUpperCase(),
        connectCulture: rowText(row, "connect_culture", "fr-FR"),
        connectVersionApi: rowText(row, "connect_version_api", "1.0"),
        connectOutputFormat: rowText(row, "connect_output_format", "10x15"),
        connectOutputType: rowText(row, "connect_output_type", "PdfUrl"),
        createdAt: stringValue(row?.created_at),
        updatedAt: stringValue(row?.updated_at),
    };
}

function settingsRowFromBody(body: JsonRecord): JsonRecord {
    const row: JsonRecord = {};
    setText(row, body, "modeCollection", "mode_collection", value => requireOneOf(value.toUpperCase(), ["CCC"], "modeCollection"));
    setText(row, body, "modeDelivery", "mode_delivery", value => requireOneOf(value.toUpperCase(), ["24R"], "modeDelivery"));
    setText(row, body, "senderName", "sender_name");
    setText(row, body, "senderFirstName", "sender_firstname");
    setText(row, body, "senderLastName", "sender_lastname");
    setText(row, body, "senderAddressLine1", "sender_address_line1");
    setText(row, body, "senderAddressLine2", "sender_address_line2");
    setText(row, body, "senderAddressLine3", "sender_address_line3");
    setText(row, body, "senderPostalCode", "sender_postal_code");
    setText(row, body, "senderCity", "sender_city");
    setText(row, body, "senderCountry", "sender_country", value => requireOneOf(value.toUpperCase(), ["FR"], "senderCountry"));
    const country = typeof row.sender_country === "string" ? row.sender_country : stringValue(body.senderCountry || "FR").toUpperCase();
    setText(row, body, "senderPhone", "sender_phone", value => normalizeSettingsPhone(value, country, "senderPhone"));
    setText(row, body, "senderMobile", "sender_mobile", value => normalizeSettingsPhone(value, country, "senderMobile"));
    setText(row, body, "senderEmail", "sender_email");
    setPositiveInteger(row, body, "defaultWeightGrams", "default_weight_grams");
    setPositiveInteger(row, body, "defaultPackageCount", "default_package_count");
    setPositiveInteger(row, body, "defaultLengthCm", "default_length_cm");
    setPositiveInteger(row, body, "defaultWidthCm", "default_width_cm");
    setPositiveInteger(row, body, "defaultHeightCm", "default_height_cm");
    setText(row, body, "defaultContent", "default_content");
    setText(row, body, "declaredCurrency", "declared_currency", value => requirePattern(value.toUpperCase(), /^[A-Z]{3}$/, "declaredCurrency must be a 3-letter currency code"));
    setText(row, body, "connectCulture", "connect_culture");
    setText(row, body, "connectVersionApi", "connect_version_api");
    setText(row, body, "connectOutputFormat", "connect_output_format");
    setText(row, body, "connectOutputType", "connect_output_type");
    return row;
}

async function shipmentByRequest(url: URL): Promise<JsonRecord | null> {
    const id = queryText(url, "id");
    if (id) return await shipmentRowById(id);
    const expeditionNumber = queryText(url, "expeditionNumber");
    if (expeditionNumber) return await shipmentRowByExpedition(expeditionNumber);
    throw new HttpError(400, "id or expeditionNumber is required");
}

function appendEqualFilter(filters: string[], name: string, value: string | undefined): void {
    if (value) filters.push(`${name}=eq.${encodeURIComponent(value)}`);
}

function trackingUrl(expeditionNumber: string, postalCode: string): string {
    const url = new URL("https://www.mondialrelay.fr/suivi-de-colis/");
    url.searchParams.set("numeroExpedition", expeditionNumber);
    if (postalCode) url.searchParams.set("codePostal", postalCode);
    return url.toString();
}

function rowText(row: JsonRecord | null, key: string, fallback: string): string {
    return stringValue(row?.[key]) || fallback;
}

function rowInteger(row: JsonRecord | null, key: string, fallback: number): number {
    const value = Number(row?.[key]);
    return Number.isInteger(value) && value > 0 ? value : fallback;
}

function hasOwn(record: JsonRecord, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(record, key);
}

function setText(row: JsonRecord, body: JsonRecord, source: string, target: string, transform: (value: string) => string = value => value): void {
    if (!hasOwn(body, source)) return;
    row[target] = transform(stringValue(body[source]));
}

function setPositiveInteger(row: JsonRecord, body: JsonRecord, source: string, target: string): void {
    if (!hasOwn(body, source)) return;
    const value = Number(stringValue(body[source]));
    if (!Number.isInteger(value) || value < 1) throw new HttpError(400, `${source} must be a positive integer`);
    row[target] = value;
}

function requireOneOf(value: string, options: string[], name: string): string {
    if (!options.includes(value)) throw new HttpError(400, `${name} must be ${options.join(" or ")}`);
    return value;
}

function requirePattern(value: string, pattern: RegExp, message: string): string {
    if (!pattern.test(value)) throw new HttpError(400, message);
    return value;
}

function normalizeSettingsPhone(value: string, country: string, name: string): string {
    const normalized = normalizePhone(value, country);
    if (value && !normalized) throw new HttpError(400, `${name} must use E.164 international format`);
    if (normalized && !/^\+[1-9]\d{7,14}$/.test(normalized)) throw new HttpError(400, `${name} must use E.164 international format`);
    return normalized;
}

function parseMondialRelayTrackingLink(value: string): JsonRecord {
    const url = new URL(value);
    const expeditionNumber = url.searchParams.get("numeroExpedition")
        ?? url.searchParams.get("expedition")
        ?? url.pathname.match(/(\d{8,})/)?.[1]
        ?? "";
    const postalCode = url.searchParams.get("codePostal") ?? url.searchParams.get("cp") ?? "";
    return {
        carrier: "mondial-relay",
        expeditionNumber,
        postalCode,
        url: value,
    };
}

function connectEndpoint(): string {
    return envDefault("MONDIAL_RELAY_CONNECT_ENDPOINT", "https://connect-api-sandbox.mondialrelay.com/api/shipment");
}
