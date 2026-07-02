import { readFileSync } from "node:fs";
import { afterAll, describe, expect, test } from "bun:test";
import {
    importIntegration,
    type IntegrationConnectorDeployer,
    type IntegrationConnectorDeployment,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import { InMemorySecretStore, secretRefToKey } from "@bernouy/cms-secrets";
import {
    handleSourceRequest,
    InMemorySourceRepository,
    validateSource,
    type SourceRepository,
} from "@bernouy/cms-sources";

type EdgeHandler = (request: Request) => Response | Promise<Response>;
type JsonRecord = Record<string, unknown>;

const sourcePrefix = "/.cms/sources/";
const functionsBaseUrl = "https://project.supabase.co/functions/v1";
const supabaseUrl = "https://project.supabase.co";
const connectEndpoint = "https://connect-api.test/api/shipment";
const definitionUrl = new URL("../integrations/mondial-relay/versions/1.0.0/definition.json", import.meta.url);
const edgeFunctionUrl = "../integrations/mondial-relay/versions/1.0.0/connectors/supabase/functions/cms-delivery/index.ts";

const realFetch = globalThis.fetch;
const realDeno = (globalThis as { Deno?: unknown }).Deno;
let activeEnv: Record<string, string> = {};
let activeFetch: typeof fetch = realFetch;
let edgeHandler: EdgeHandler | undefined;

(globalThis as { Deno?: { env: { get: (key: string) => string | undefined }; serve: (handler: EdgeHandler) => unknown } }).Deno = {
    env: { get: (key) => activeEnv[key] },
    serve(handler) {
        edgeHandler = handler;
        return { shutdown() { /* test stub */ } };
    },
};
globalThis.fetch = ((input, init) => activeFetch(input, init)) as typeof fetch;

afterAll(() => {
    globalThis.fetch = realFetch;
    (globalThis as { Deno?: unknown }).Deno = realDeno;
});

describe("mondial-relay 1.0.0 source", () => {
    test("loads from the official integration catalog", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const list = await repo.list();
        const definition = await repo.get("mondial-relay");

        expect(list.map(entry => entry.kind)).toContain("mondial-relay");
        expect(definition?.kind).toBe("mondial-relay");
        expect(definition?.version).toBe("1.0.0");
        expect(JSON.stringify(definition)).toContain("\"input\":\"lookup\"");
    });

    test("installs the Connect source and dashboard with widget-backed relay lookup", async () => {
        const harness = await createHarness();
        const source = await harness.sources.getSource("urn:delivery");
        const dashboard = await harness.dashboards.getDashboard("delivery-delivery");
        const createEndpoint = source?.endpoints.find(endpoint => endpoint.urn === "urn:delivery:createShipment");
        const createBody = createEndpoint?.input?.body;

        expect(source).toBeTruthy();
        expect(validateSource(source!)).toEqual([]);
        expect(source?.endpoints.map(endpoint => endpoint.urn)).toContain("urn:delivery:relayPoints");
        expect(createBody?.properties?.deliveryRelayLocation).toEqual({ type: "string" });
        expect(createBody?.properties).not.toHaveProperty("deliveryRelayNumber");
        expect(createBody?.properties).not.toHaveProperty("sizeCode");
        expect(createBody?.properties).not.toHaveProperty("insuranceLevel");
        expect(dashboard).toBeTruthy();
        const dashboardJson = JSON.stringify(dashboard);
        expect(dashboardJson).toContain("deliveryRelayLocation");
        expect(dashboardJson).toContain("relayPoints");
        expect(dashboardJson).toContain("Edit settings");
        expect(dashboardJson).toContain("Sender address");
        expect(dashboardJson).toContain("Default weight grams");
        expect(dashboardJson).toContain("\"input\":\"lookup\"");
        expect(harness.deployment?.dataApiSchemas).toEqual(["delivery"]);
        const functionSecrets = harness.deployment?.functions[0]?.secrets ?? {};
        expect(functionSecrets).toMatchObject({
            MONDIAL_RELAY_CONNECT_ENDPOINT: connectEndpoint,
            MONDIAL_RELAY_CONNECT_LOGIN: "connect-login",
            MONDIAL_RELAY_CONNECT_PASSWORD: "connect-password",
            MONDIAL_RELAY_CONNECT_CUSTOMER_ID: "TTMRSDBX",
            MONDIAL_RELAY_WIDGET_BRAND: "TTMRSDBX",
        });
        expect(functionSecrets).not.toHaveProperty("MONDIAL_RELAY_SENDER_NAME");
        expect(functionSecrets).not.toHaveProperty("MONDIAL_RELAY_DEFAULT_MODE_COL");
    });

    test("lists relay points through the installed CMS source", async () => {
        const harness = await createHarness();
        const response = await relayPoints(harness, { country: "FR", postalCode: "75001", city: "Paris", weightGrams: "500", limit: "3" });
        const body = await jsonBody(response);

        expect(response.status).toBe(200);
        expect(body.items).toEqual([
            {
                location: "FR-024474",
                number: "024474",
                country: "FR",
                name: "LOCKER G20 RUE REAUMUR",
                label: "LOCKER G20 RUE REAUMUR - 75002 - PARIS",
                addressLine1: "85 BIS RUE REAUMUR",
                addressLine2: "",
                postalCode: "75002",
                city: "PARIS",
                latitude: 48.866999,
                longitude: 2.347949,
                nature: "C",
                available: true,
                warning: "",
                photo: "",
                openingHoursHtml: "",
            },
        ]);
        expect(harness.relayLookupUrl()?.searchParams.get("Brand")).toBe("TTMRSDBX");
        expect(harness.relayLookupUrl()?.searchParams.get("PostCode")).toBe("75001");
        expect(harness.relayLookupUrl()?.searchParams.get("ColLivMod")).toBe("24R");
        expect(harness.relayLookupUrl()?.searchParams.get("Weight")).toBe("500");
    });

    test("creates a Connect shipment through the installed CMS source", async () => {
        const harness = await createHarness();
        const response = await createShipment(harness, validShipmentBody());
        const body = await jsonBody(response);

        expect(response.status).toBe(201);
        expect(body).toMatchObject({
            ok: true,
            expeditionNumber: "00435394",
            labelUrl: "https://labels.test/00435394.pdf",
            status: "label_ready",
        });
        expect(harness.connectRequestXml()).toContain('<DeliveryMode Mode="24R" Location="FR-031270" />');
        expect(harness.connectRequestXml()).toContain('<CollectionMode Mode="CCC" Location="" />');
        expect(harness.connectRequestXml()).toContain('<Weight Value="500" Unit="gr" />');
        expect(harness.connectRequestXml()).toContain("<Culture>fr-FR</Culture>");
        expect(harness.connectRequestXml()).toContain("<OutputFormat>10x15</OutputFormat>");
        expect(harness.connectRequestXml()).toContain("<PhoneNo>+33600000000</PhoneNo>");
        expect(harness.connectRequestXml()).toContain("<HouseNo>17B</HouseNo>");
        expect(harness.connectRequestXml()).toContain("<Streetname>Chemin du Fond du Val</Streetname>");
        expect(harness.insertedShipments).toHaveLength(1);
        expect(harness.insertedShipments[0]).toMatchObject({
            external_order_id: "order-1001",
            expedition_number: "00435394",
            tracking_number: "00435394",
            status: "label_ready",
            delivery_relay_country: "FR",
            delivery_relay_number: "FR-031270",
            mode_collection: "CCC",
            mode_delivery: "24R",
            recipient_postal_code: "76930",
            recipient_city: "Octeville-sur-Mer",
            sender_phone: "+33600000000",
            recipient_phone: "+33600000000",
            weight_grams: 500,
            package_count: 1,
            created_by: "user-123",
        });
        expect(harness.insertedShipments[0]?.raw_request).toMatchObject({
            deliveryRelayLocation: "FR-031270",
            widthCm: 20,
            heightCm: 10,
            content: "Books",
        });
        expect(harness.insertedShipments[0]?.raw_response).toMatchObject({
            modeSandbox: true,
            statuses: [{ code: "0", level: "Info", message: "Success" }],
        });
    });

    test("updates delivery settings through the installed CMS source", async () => {
        const harness = await createHarness();
        const response = await setSettings(harness, {
            modeCollection: "CCC",
            modeDelivery: "24R",
            senderName: "Updated Shop",
            senderAddressLine1: "2 Rue Test",
            senderPostalCode: "69001",
            senderCity: "Lyon",
            senderCountry: "FR",
            senderPhone: "+330608138404",
            defaultWeightGrams: 750,
            defaultPackageCount: 1,
            defaultLengthCm: 32,
            defaultWidthCm: 22,
            defaultHeightCm: 12,
            defaultContent: "Updated goods",
            declaredCurrency: "EUR",
            connectCulture: "fr-FR",
            connectVersionApi: "1.0",
            connectOutputFormat: "10x15",
            connectOutputType: "PdfUrl",
        });
        const body = await jsonBody(response);

        expect(response.status).toBe(200);
        expect(body).toMatchObject({
            id: "default",
            senderName: "Updated Shop",
            senderPhone: "+33608138404",
            defaultWeightGrams: 750,
        });

        const shipmentBody = { ...validShipmentBody(), recipientPhone: "+330608138404", content: undefined };
        const shipmentResponse = await createShipment(harness, shipmentBody);
        expect(shipmentResponse.status).toBe(201);
        expect(harness.connectRequestXml()).toContain("<Firstname>Updated</Firstname>");
        expect(harness.connectRequestXml()).toContain("<Lastname>Shop</Lastname>");
        expect(harness.connectRequestXml()).toContain("<PhoneNo>+33608138404</PhoneNo>");
        expect(harness.insertedShipments.at(-1)).toMatchObject({
            sender_name: "Updated Shop",
            sender_phone: "+33608138404",
            recipient_phone: "+33608138404",
        });
    });

    test("rejects invalid phone values through the installed CMS source", async () => {
        const harness = await createHarness();
        const settingsResponse = await setSettings(harness, { senderPhone: "+abc" });
        const settingsBody = await jsonBody(settingsResponse);

        expect(settingsResponse.status).toBe(400);
        expect(settingsBody.error).toBe("senderPhone must use E.164 international format");

        const shipmentResponse = await createShipment(harness, { ...validShipmentBody(), recipientPhone: "phone" });
        const shipmentBody = await jsonBody(shipmentResponse);

        expect(shipmentResponse.status).toBe(400);
        expect(shipmentBody.error).toBe("recipient.phone must use E.164 international format");
    });

    test("returns Connect provider status errors without leaking the password", async () => {
        const harness = await createHarness({
            connectStatusCode: "10001",
            connectStatusLevel: "Error",
            connectStatusMessage: "Invalid login or password",
        });
        const response = await createShipment(harness, validShipmentBody());
        const body = await jsonBody(response);

        expect(response.status).toBe(502);
        expect(body.error).toBe("Mondial Relay Connect returned status 10001: Invalid login or password");
        expect(body.mondialRelay).toMatchObject({
            operation: "ShipmentCreationRequest",
            endpoint: connectEndpoint,
            fields: {
                customerId: "TTMRSDBX",
                modeCollection: "CCC",
                modeDelivery: "24R",
                deliveryRelayLocation: "FR-031270",
                weightGrams: 500,
            },
        });
        expect(JSON.stringify(body)).not.toContain("connect-password");
        expect(harness.insertedShipments).toEqual([]);
    });
});

async function createHarness(options: {
    connectStatusCode?: string;
    connectStatusLevel?: string;
    connectStatusMessage?: string;
} = {}) {
    const sources = new InMemorySourceRepository();
    const secrets = new InMemorySecretStore();
    const dashboards = new InMemoryDashboardRepository();
    let deployment: IntegrationConnectorDeployment | undefined;
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

    const result = await importIntegration(
        { sources, secrets, dashboards, connectorDeployers: [deployer] },
        { kind: "mondial-relay", answers: integrationAnswers(), options: {} },
        [definition()],
    );
    const functionSecrets = deployment?.functions[0]?.secrets ?? {};
    activeEnv = {
        ...Object.fromEntries(Object.entries(functionSecrets).map(([key, value]) => [key, String(value)])),
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SECRET_KEYS: JSON.stringify({ default: "supabase-secret-key", secondary: "secondary-secret-key" }),
        SUPABASE_SERVICE_ROLE_KEY: "legacy-service-role-key",
    };

    const handler = await loadEdgeHandler();
    const insertedShipments: JsonRecord[] = [];
    let settingRow = defaultSettingsRow();
    let connectRequestXml = "";
    let relayLookupUrl: URL | undefined;
    activeFetch = async (input, init) => {
        const request = requestFromFetchInput(input, init);
        const url = new URL(request.url);
        const method = request.method.toUpperCase();
        const requestBody = method === "GET" || method === "HEAD" ? "" : await request.clone().text();

        if (url.origin === "https://widget.mondialrelay.com" && url.pathname.endsWith("/SearchPR")) {
            relayLookupUrl = url;
            return jsonpResponse(widgetRelayLookupResponse());
        }
        if (request.url === connectEndpoint) {
            connectRequestXml = requestBody;
            return xmlResponse(connectShipmentResponse(options));
        }
        if (url.origin === supabaseUrl) {
            expect(request.headers.get("apikey")).toBe("supabase-secret-key");
            expect(request.headers.get("authorization")).toBe("Bearer supabase-secret-key");
            expect(request.headers.get("accept-profile")).toBe("delivery");
            if (method !== "GET" && method !== "HEAD") {
                expect(request.headers.get("content-profile")).toBe("delivery");
            }
        }
        if (url.origin === supabaseUrl && url.pathname === "/rest/v1/shipments" && method === "POST") {
            const row = JSON.parse(requestBody) as JsonRecord;
            insertedShipments.push(row);
            return jsonResponse([{ ...row, created_at: "2026-07-02T10:00:00.000Z", updated_at: "2026-07-02T10:00:00.000Z" }], 201);
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
            return jsonResponse(insertedShipments, 200);
        }
        if (url.origin === supabaseUrl && url.pathname === "/rest/v1/shipment_events" && method === "GET") {
            return jsonResponse([], 200);
        }
        throw new Error(`unexpected fetch: ${method} ${request.url}`);
    };

    return {
        result,
        sources,
        secrets,
        dashboards,
        deployment,
        insertedShipments,
        connectRequestXml: () => connectRequestXml,
        relayLookupUrl: () => relayLookupUrl,
        settingsRow: () => settingRow,
        async sourceFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
            try {
                const request = requestFromFetchInput(input, init);
                if (!request.url.startsWith(`${functionsBaseUrl}/cms-delivery/`)) {
                    throw new Error(`unexpected source proxy fetch: ${request.method} ${request.url}`);
                }
                return await handler(request);
            } catch (error) {
                return new Response(error instanceof Error ? error.stack ?? error.message : String(error), { status: 599 });
            }
        },
        async resolveSecret(ref: string): Promise<string | undefined> {
            const key = secretRefToKey(ref) ?? ref;
            return await secrets.get(key) ?? undefined;
        },
    };
}

function requestFromFetchInput(input: RequestInfo | URL, init?: RequestInit): Request {
    if (input instanceof Request && !init) return input;
    return new Request(input instanceof Request ? input.url : String(input), {
        method: init?.method ?? (input instanceof Request ? input.method : undefined),
        headers: init?.headers ?? (input instanceof Request ? input.headers : undefined),
        body: init?.body ?? (input instanceof Request ? input.body : undefined),
        redirect: init?.redirect,
    });
}

async function relayPoints(harness: {
    sources: SourceRepository;
    sourceFetch: typeof fetch;
    resolveSecret: (ref: string) => Promise<string | undefined>;
}, params: Record<string, string>): Promise<Response> {
    const url = new URL(`http://cms.local${sourcePrefix}delivery/relayPoints`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return await handleSourceRequest(
        harness.sources,
        new Request(url),
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

async function createShipment(harness: {
    sources: SourceRepository;
    sourceFetch: typeof fetch;
    resolveSecret: (ref: string) => Promise<string | undefined>;
}, body: JsonRecord): Promise<Response> {
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
            },
        },
    );
}

async function setSettings(harness: {
    sources: SourceRepository;
    sourceFetch: typeof fetch;
    resolveSecret: (ref: string) => Promise<string | undefined>;
}, body: JsonRecord): Promise<Response> {
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

async function loadEdgeHandler(): Promise<EdgeHandler> {
    if (!edgeHandler) await import(edgeFunctionUrl);
    if (!edgeHandler) throw new Error("cms-delivery edge handler was not registered");
    return edgeHandler;
}

function definition(): IntegrationDefinition {
    return JSON.parse(readFileSync(definitionUrl, "utf8")) as IntegrationDefinition;
}

function integrationAnswers(): Record<string, string> {
    return {
        id: "delivery",
        mondialRelayConnectEndpoint: connectEndpoint,
        mondialRelayConnectLogin: "connect-login",
        mondialRelayConnectPassword: "connect-password",
        mondialRelayConnectCustomerId: "TTMRSDBX",
    };
}

function defaultSettingsRow(): JsonRecord {
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

function validShipmentBody(): JsonRecord {
    return {
        externalOrderId: "order-1001",
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
    };
}

function connectShipmentResponse(options: {
    connectStatusCode?: string;
    connectStatusLevel?: string;
    connectStatusMessage?: string;
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
          <Output>https://labels.test/00435394.pdf</Output>
        </Label>
      </LabelList>
    </Shipment>
  </ShipmentsList>
  <StatusList>
    <Status Code="${xmlEscape(code)}" Level="${xmlEscape(level)}" Message="${xmlEscape(message)}" />
  </StatusList>
</ShipmentCreationResponse>`;
}

function widgetRelayLookupResponse(): string {
    return `cmsRelayPoints({
  "Error": null,
  "PRList": [
    {
      "Adresse1": "38 RUE MAUCONSEIL",
      "Adresse2": "",
      "Available": false,
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
      "Warning": "<span class='PR-Warning'>Unavailable</span>"
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

function jsonResponse(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: { "content-type": "application/json; charset=utf-8" },
    });
}

function jsonpResponse(value: string, status = 200): Response {
    return new Response(value, {
        status,
        headers: { "content-type": "application/javascript; charset=utf-8" },
    });
}

async function jsonBody(response: Response): Promise<JsonRecord> {
    const text = await response.text();
    try {
        return JSON.parse(text) as JsonRecord;
    } catch {
        throw new Error(`expected JSON response, got ${response.status}: ${text}`);
    }
}

function xmlResponse(value: string, status = 200): Response {
    return new Response(value, {
        status,
        headers: { "content-type": "application/xml; charset=utf-8" },
    });
}

function xmlEscape(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}
