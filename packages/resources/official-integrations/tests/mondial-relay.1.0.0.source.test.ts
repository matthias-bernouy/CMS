import { readFileSync } from "node:fs";
import { afterAll, describe, expect, setSystemTime, test } from "bun:test";
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
import { md5 } from "../integrations/mondial-relay/versions/1.0.0/connectors/supabase/functions/cms-delivery/provider/md5.ts";
import {
    fallbackTrackingStatus,
    normalizeTrackingLabel,
    statusAfterObservation,
} from "../integrations/mondial-relay/versions/1.0.0/connectors/supabase/functions/cms-delivery/provider/tracking-status.ts";
import { handleError } from "../integrations/mondial-relay/versions/1.0.0/connectors/supabase/functions/cms-delivery/http.ts";
import { dataApiError } from "../integrations/mondial-relay/versions/1.0.0/connectors/supabase/functions/cms-delivery/shipment/supabase.ts";

type EdgeHandler = (request: Request) => Response | Promise<Response>;
type JsonRecord = Record<string, unknown>;
type ObservedFetchRequest = {
    method: string;
    url: string;
    pathname: string;
    searchParams: Record<string, string>;
    body?: unknown;
};
type ObservedFetchStep = {
    kind: "postgrest" | "provider";
    method: string;
    pathname: string;
};

const sourcePrefix = "/.cms/sources/";
const functionsBaseUrl = "https://project.supabase.co/functions/v1";
const supabaseUrl = "https://project.supabase.co";
const connectEndpoint = "https://connect-api-sandbox.mondialrelay.com/api/shipment";
const trackingEndpoint = "https://api.mondialrelay.com/WebService.asmx";
const definitionUrl = new URL("../integrations/mondial-relay/versions/1.0.0/definition.json", import.meta.url);
const edgeFunctionUrl =
    "../integrations/mondial-relay/versions/1.0.0/connectors/supabase/functions/cms-delivery/index.ts";

const realFetch = globalThis.fetch;
const realDeno = (globalThis as { Deno?: unknown }).Deno;
let activeEnv: Record<string, string> = {};
let activeFetch: typeof fetch = realFetch;
let edgeHandler: EdgeHandler | undefined;

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

describe("mondial-relay 1.0.0 source", () => {
    test("redacts internal and unexpected database error details", async () => {
        const publicDatabaseError = dataApiError(
            400,
            JSON.stringify({
                message: "validation: invalid projection claim settings",
            }),
        );
        expect(publicDatabaseError.status).toBe(400);
        expect(publicDatabaseError.message).toBe("invalid projection claim settings");

        const privateDatabaseError = dataApiError(
            500,
            JSON.stringify({
                message: "duplicate key violates delivery_shipments_private_reference_key",
                detail: "Key (private_reference)=(customer-secret) already exists",
            }),
        );
        expect(privateDatabaseError.status).toBe(502);
        expect(privateDatabaseError.message).toBe("Supabase Data API request failed (500)");
        expect(privateDatabaseError.message).not.toContain("customer-secret");

        const originalConsoleError = console.error;
        console.error = () => undefined;
        try {
            const response = handleError(new Error("MONDIAL_RELAY_CONNECT_PASSWORD=secret"));
            expect(response.status).toBe(500);
            expect(await response.json()).toEqual({ error: "internal error" });
        } finally {
            console.error = originalConsoleError;
        }
    });

    test("computes the uppercase-compatible WebService security digest", () => {
        expect(md5("abc")).toBe("900150983cd24fb0d6963f7d28e17f72");
    });

    test("normalizes 24R milestones without treating STAT 82 or relay arrival as recipient handoff", () => {
        expect(fallbackTrackingStatus("82")).toBe("arrived_at_pickup_point");
        expect(normalizeTrackingLabel("Colis livré au Point Relais")).toBe("arrived_at_pickup_point");
        expect(normalizeTrackingLabel("Colis disponible au Point Relais")).toBe("available_for_pickup");
        expect(normalizeTrackingLabel("Colis remis au destinataire")).toBe("collected_by_recipient");
        for (const negativeHandoff of [
            "Colis non remis au destinataire",
            "Colis non livré au destinataire",
            "Remise impossible au destinataire",
            "Remise refusée par le destinataire",
            "Parcel not delivered to the recipient",
            "Handoff refused by the recipient",
            "Unable to deliver to the recipient",
            "Delivery failed for the recipient",
        ]) {
            expect(normalizeTrackingLabel(negativeHandoff)).toBe("incident");
            expect(normalizeTrackingLabel(negativeHandoff)).not.toBe("collected_by_recipient");
        }
        expect(normalizeTrackingLabel("Colis remis au destinataire avec réserve")).toBe("incident");
        expect(normalizeTrackingLabel("Package handed to customer with reservation")).toBe("incident");
        expect(normalizeTrackingLabel("Délai de retrait dépassé - colis non réclamé")).toBe("pickup_expired");
        expect(normalizeTrackingLabel("Colis en cours de retour vers l'expéditeur")).toBe("returning_to_sender");
        expect(normalizeTrackingLabel("Colis remis à l'expéditeur")).toBe("returned_to_sender");
        expect(statusAfterObservation("collected_by_recipient", "in_transit")).toBe("collected_by_recipient");
    });

    test("loads from the official integration catalog", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const list = await repo.list();
        const definition = await repo.get("mondial-relay");

        expect(list.map((entry) => entry.kind)).toContain("mondial-relay");
        expect(definition?.kind).toBe("mondial-relay");
        expect(definition?.version).toBe("1.0.0");
        const serialized = JSON.stringify(definition);
        expect(serialized).toContain("mondial-relay-picker");
        expect(serialized).toContain("reconcileShipments");
        expect(serialized).toContain("recipientHandoffAt");
        expect(definition?.inputs.find((input) => input.name === "mondialRelayConnectEndpoint")).toMatchObject({
            type: "select",
            options: [
                { label: "Sandbox", value: "https://connect-api-sandbox.mondialrelay.com/api/shipment" },
                { label: "Production", value: "https://connect-api.mondialrelay.com/api/shipment" },
            ],
        });
        expect(definition?.inputs.find((input) => input.name === "mondialRelayTrackingEndpoint")).toMatchObject({
            type: "select",
            options: [{ label: "Production WebService", value: "https://api.mondialrelay.com/WebService.asmx" }],
        });
        const sourceArtifact = definition?.artifacts.find((artifact) => artifact.type === "source");
        const createOutput = JSON.stringify(
            sourceArtifact?.type === "source"
                ? sourceArtifact.source.endpoints.find((endpoint) => endpoint.endpointId === "createShipment")?.output
                : null,
        );
        expect(createOutput).not.toContain("labelUrl");
    });

    test("claims due tracking rows with a stale lease and skip-locked concurrency", async () => {
        const schema = await Bun.file(
            new URL("../integrations/mondial-relay/versions/1.0.0/connectors/supabase/schema.sql", import.meta.url),
        ).text();

        expect(schema).toContain("create or replace function delivery.claim_due_shipments");
        expect(schema).toContain("for update skip locked");
        expect(schema).toContain("tracking_claimed_at <= now() - interval '20 minutes'");
        expect(schema).toContain("tracking_next_attempt_at");
    });

    test("declares durable projection leases, bounded retries, and manual review", async () => {
        const schema = await Bun.file(
            new URL("../integrations/mondial-relay/versions/1.0.0/connectors/supabase/schema.sql", import.meta.url),
        ).text();

        expect(schema).toContain("create or replace function delivery.claim_pending_shipment_events");
        expect(schema).toContain("projection_claim_token");
        expect(schema).toContain("projection_attempts");
        expect(schema).toContain("projection_next_attempt_at");
        expect(schema).toContain("projection_last_error");
        expect(schema).toContain("projection_status = 'manual_review'");
        expect(schema).toContain("for update skip locked");
    });

    test("installs the Connect source and dashboard with widget-backed relay lookup", async () => {
        const harness = await createHarness();
        const source = await harness.sources.getSource("urn:delivery");
        const dashboard = await harness.dashboards.getDashboard("delivery-delivery");
        const createEndpoint = source?.endpoints.find((endpoint) => endpoint.urn === "urn:delivery:createShipment");
        const createBody = createEndpoint?.input?.body;
        const saveSelection = source?.endpoints.find((endpoint) => endpoint.urn === "urn:delivery:saveRelaySelection");
        const resolveQuote = source?.endpoints.find((endpoint) => endpoint.urn === "urn:delivery:resolveDeliveryQuote");
        const deliveryQuote = source?.endpoints.find((endpoint) => endpoint.urn === "urn:delivery:deliveryQuote");
        const issueLabelAccess = source?.endpoints.find((endpoint) => endpoint.urn === "urn:delivery:issueLabelAccess");

        expect(source).toBeTruthy();
        expect(validateSource(source!)).toEqual([]);
        expect(source?.endpoints.map((endpoint) => endpoint.urn)).toContain("urn:delivery:relayPoints");
        expect(source?.endpoints.map((endpoint) => endpoint.urn)).toContain("urn:delivery:saveRelaySelection");
        expect(source?.endpoints.map((endpoint) => endpoint.urn)).toContain("urn:delivery:relaySelection");
        expect(createBody?.properties?.deliveryRelayLocation).toEqual({ type: "string" });
        expect(createBody?.properties?.sellerCmsUserId?.semantic?.authority).toBe("cms");
        expect(createBody?.properties?.selectedForCmsUserId?.semantic?.authority).toBe("cms");
        expect(saveSelection?.input?.body?.properties?.selectedForCmsUserId?.semantic?.authority).toBe("cms");
        expect(resolveQuote?.input?.body?.properties?.selectedForCmsUserId?.semantic?.authority).toBe("cms");
        expect(
            deliveryQuote?.input?.params?.find((param) => param.name === "selectedForCmsUserId")?.schema?.semantic
                ?.authority,
        ).toBe("cms");
        expect(issueLabelAccess?.input?.body?.properties?.sellerCmsUserId?.semantic?.authority).toBe("cms");
        expect(createBody?.properties).not.toHaveProperty("deliveryRelayNumber");
        expect(createBody?.properties).not.toHaveProperty("sizeCode");
        expect(createBody?.properties).not.toHaveProperty("insuranceLevel");
        expect(dashboard).toBeTruthy();
        expect(validateDashboard(dashboard!, { source: source! })).toEqual([]);
        const views = dashboard?.views as JsonRecord[] | undefined;
        expect(views?.map((view) => `${view.widget}:${view.id}`)).toEqual([
            "w-table:shipmentsTable",
            "w-table:projectionExceptionsTable",
            "w-detail:shipmentDetail",
            "w-detail:settingsDetail",
        ]);
        const shipmentsTable = views?.[0];
        const tableActions = shipmentsTable?.actions as JsonRecord[] | undefined;
        expect(tableActions?.map((action) => action.id)).toEqual(["openSettings"]);
        expect(tableActions?.[0]).toMatchObject({ selection: { opens: "settingsDetail" } });
        const settingsDetail = dashboard?.views.find((view) => view.id === "settingsDetail");
        if (settingsDetail?.widget !== "w-detail") {
            throw new Error("delivery settings detail not installed");
        }
        expect(settingsDetail.actions?.find((action) => action.id === "saveSettings")?.after).toEqual({
            resource: "$result",
        });
        const dashboardJson = JSON.stringify(dashboard);
        expect(dashboardJson).toContain("recoverUnknownShipment");
        expect(dashboardJson).not.toContain("createShipmentForm");
        expect(dashboardJson).not.toContain('"widget":"w-tabs"');
        expect(dashboardJson).not.toContain('"id":"pickupPoints"');
        expect(dashboardJson).not.toContain('"id":"relayPointsTable"');
        expect(dashboardJson).toContain("Edit settings");
        expect(dashboardJson).toContain("Sender address");
        expect(dashboardJson).toContain("Default weight grams");
        expect(dashboardJson).not.toContain('"path":"labelUrl"');
        expect(harness.deployment?.dataApiSchemas).toEqual(["delivery"]);
        const functionSecrets = harness.deployment?.functions[0]?.secrets ?? {};
        expect(functionSecrets).toMatchObject({
            MONDIAL_RELAY_CONNECT_ENDPOINT: connectEndpoint,
            MONDIAL_RELAY_CONNECT_LOGIN: "connect-login",
            MONDIAL_RELAY_CONNECT_PASSWORD: "connect-password",
            MONDIAL_RELAY_CONNECT_CUSTOMER_ID: "TTMRSDBX",
            MONDIAL_RELAY_WIDGET_BRAND: "TTMRSDBX",
            MONDIAL_RELAY_TRACKING_ENDPOINT: trackingEndpoint,
            MONDIAL_RELAY_TRACKING_BRAND: "BDTEST",
            MONDIAL_RELAY_TRACKING_PRIVATE_KEY: "tracking-private-key",
        });
        expect(functionSecrets).not.toHaveProperty("MONDIAL_RELAY_SENDER_NAME");
        expect(functionSecrets).not.toHaveProperty("MONDIAL_RELAY_DEFAULT_MODE_COL");
        expect(harness.importedBlocs[0]?.viewJS).toContain("Choisissez un point relais");
        expect(harness.importedBlocs[0]?.viewJS).toContain("setRelayPointForOrder");
        expect(harness.importedBlocs[0]?.viewJS).toContain("mondial-relay-picker:change");
        expect(harness.importedBlocs[0]?.viewJS).toContain("source-id");
        expect(harness.importedBlocs[0]?.editorJS).toContain('type: "color"');
    });

    test("lists 24R relay points and excludes lockers through the installed CMS source", async () => {
        const harness = await createHarness();
        const response = await relayPoints(harness, {
            country: "FR",
            postalCode: "75001",
            city: "Paris",
            weightGrams: "500",
            limit: "3",
        });
        const body = await jsonBody(response);

        expect(response.status).toBe(200);
        expect(body.items).toEqual([
            {
                location: "FR-034439",
                number: "034439",
                country: "FR",
                name: "ARS INFORMATIQUE",
                label: "ARS INFORMATIQUE - 75001 - PARIS",
                addressLine1: "38 RUE MAUCONSEIL",
                addressLine2: "",
                postalCode: "75001",
                city: "PARIS",
                latitude: 48.8641433,
                longitude: 2.3470309,
                nature: "1",
                pointType: "relay_point",
                available: true,
                warning: "",
                photo: "",
                openingHoursHtml: "",
                shippingAmount: 450,
                currency: "eur",
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
        expect(body).toEqual({
            ok: true,
            id: harness.insertedShipments[0]?.id,
            expeditionNumber: "00435394",
            trackingUrl: "https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=00435394&codePostal=76930",
            status: "label_ready",
            createdAt: "2026-07-02T10:00:00.000Z",
        });
        expect(harness.connectRequestXml()).toContain('<DeliveryMode Mode="24R" Location="FR-031270" />');
        expect(harness.connectRequestXml()).toContain('<CollectionMode Mode="CCC" Location="" />');
        expect(harness.connectRequestXml()).toContain('<Weight Value="500" Unit="gr" />');
        expect(harness.connectRequestXml()).toContain('<ShipmentValue Currency="EUR" Amount="123.45" />');
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
            declared_value_minor_amount: 12345,
            declared_currency: "EUR",
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
        expect(harness.postgrestRequests().map((request) => [request.method, request.pathname])).toEqual([
            ["GET", "/rest/v1/settings"],
            ["POST", "/rest/v1/rpc/reserve_shipment_creation"],
            ["PATCH", "/rest/v1/shipments"],
        ]);
        expect(harness.providerRequests().map((request) => [request.method, request.pathname])).toEqual([
            ["POST", "/api/shipment"],
        ]);
        expect(harness.fetchTimeline()).toEqual([
            { kind: "postgrest", method: "GET", pathname: "/rest/v1/settings" },
            { kind: "postgrest", method: "POST", pathname: "/rest/v1/rpc/reserve_shipment_creation" },
            { kind: "provider", method: "POST", pathname: "/api/shipment" },
            { kind: "postgrest", method: "PATCH", pathname: "/rest/v1/shipments" },
        ]);
        expect(harness.postgrestRequests()[1]?.body).toMatchObject({
            p_reservation: {
                status: "creating",
                external_order_id: "order-1001",
                seller_cms_user_id: "seller-42",
                delivery_quote_id: `mrq_${"a".repeat(64)}`,
            },
        });
        expect((harness.postgrestRequests()[1]?.body as JsonRecord)?.p_reservation).not.toHaveProperty(
            "expedition_number",
        );
        expect(harness.postgrestRequests()[2]?.body).toMatchObject({
            status: "label_ready",
            expedition_number: "00435394",
            tracking_number: "00435394",
        });
    });

    test("returns the exact admin shipment detail by id or expedition with ordered events", async () => {
        const harness = await createHarness();
        await createShipment(harness, validShipmentBody());
        const shipment = harness.insertedShipments[0]!;
        Object.assign(shipment, {
            last_error: null,
            recipient_address_line2: null,
            latest_event_label: "Disponible au Point Relais",
            latest_event_at: "2026-07-14T11:00:00.000Z",
            carrier_accepted_at: "2026-07-13T08:00:00.000Z",
            arrived_at_pickup_point_at: "2026-07-14T10:45:00.000Z",
            available_for_pickup_at: "2026-07-14T11:00:00.000Z",
            recipient_handoff_at: null,
            pickup_expired_at: null,
            returning_to_sender_at: null,
            returned_to_sender_at: null,
            incident_at: null,
            lost_at: null,
            seller_handoff_declared_at: null,
        });
        harness.shipmentEvents.push(
            {
                id: 2,
                shipment_id: shipment.id,
                order_public_id: "order-1001",
                expedition_number: "00435394",
                provider_event_key: "event-latest",
                normalized_status: "available_for_pickup",
                occurred_at: "2026-07-14T11:00:00.000Z",
                event_label: "Disponible au Point Relais",
                event_date: "14/07/2026",
                event_time: "11:00",
                location: "PARIS",
                created_at: "2026-07-14T11:01:00.000Z",
            },
            {
                id: 1,
                shipment_id: shipment.id,
                order_public_id: "order-1001",
                expedition_number: "00435394",
                provider_event_key: "event-created",
                normalized_status: "in_transit",
                occurred_at: null,
                event_label: "Prise en charge agence",
                event_date: null,
                event_time: null,
                location: null,
                created_at: "2026-07-13T08:00:00.000Z",
            },
        );
        const expected = {
            id: shipment.id,
            externalOrderId: "order-1001",
            expeditionNumber: "00435394",
            status: "label_ready",
            createdAt: "2026-07-02T10:00:00.000Z",
            lastError: null,
            trackingUrl: "https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=00435394&codePostal=76930",
            recipientName: "Client Test",
            recipientEmail: "recipient@example.test",
            recipientPhone: "+33600000000",
            recipientAddressLine1: "17B Chemin du Fond du Val",
            recipientAddressLine2: null,
            recipientPostalCode: "76930",
            recipientCity: "Octeville-sur-Mer",
            recipientCountry: "FR",
            weightGrams: 500,
            packageCount: 1,
            latestEventLabel: "Disponible au Point Relais",
            latestEventAt: "2026-07-14T11:00:00.000Z",
            carrierAcceptedAt: "2026-07-13T08:00:00.000Z",
            arrivedAtPickupPointAt: "2026-07-14T10:45:00.000Z",
            availableForPickupAt: "2026-07-14T11:00:00.000Z",
            recipientHandoffAt: null,
            pickupExpiredAt: null,
            returningToSenderAt: null,
            returnedToSenderAt: null,
            incidentAt: null,
            lostAt: null,
            sellerHandoffDeclaredAt: null,
            events: [
                {
                    eventLabel: "Disponible au Point Relais",
                    eventDate: "14/07/2026",
                    eventTime: "11:00",
                    normalizedStatus: "available_for_pickup",
                    occurredAt: "2026-07-14T11:00:00.000Z",
                    location: "PARIS",
                },
                {
                    eventLabel: "Prise en charge agence",
                    eventDate: null,
                    eventTime: null,
                    normalizedStatus: "in_transit",
                    occurredAt: null,
                    location: null,
                },
            ],
            deliveryRelayLocation: "FR-031270",
        };

        for (const params of [{ id: String(shipment.id) }, { expeditionNumber: "00435394" }]) {
            harness.resetRequestHistory();
            const response = await sourceRequest(harness, "shipment", {
                method: "GET",
                userId: "admin-1",
                userRole: "admin",
                enforceAccess: true,
                params,
            });

            expect(response.status).toBe(200);
            const detail = await jsonBody(response);
            expect(detail).toEqual(expected);
            for (const privateField of ["senderEmail", "metadata", "rawResponse", "labelUrl"]) {
                expect(detail).not.toHaveProperty(privateField);
            }
            expect(harness.postgrestRequests().map((request) => [request.method, request.pathname])).toEqual([
                ["GET", "/rest/v1/shipments"],
            ]);
            const shipmentRequest = harness.postgrestRequests()[0]!;
            expect(shipmentRequest.searchParams[params.id ? "id" : "expedition_number"]).toBe(
                `eq.${params.id ?? params.expeditionNumber}`,
            );
            expect(shipmentRequest.searchParams).toMatchObject({
                "events.order": "occurred_at.desc.nullslast,created_at.desc",
            });
            expect(shipmentRequest.searchParams.select).toContain(
                "events:shipment_events!shipment_events_shipment_id_fkey(",
            );
            expect(harness.providerRequests()).toEqual([]);
        }

        harness.resetRequestHistory();
        const byExternalOrder = await sourceRequest(harness, "shipmentForExternalOrder", {
            method: "GET",
            userId: "system",
            userRole: "system",
            enforceAccess: true,
            params: { externalOrderId: "order-1001" },
        });
        expect(byExternalOrder.status).toBe(200);
        expect(await jsonBody(byExternalOrder)).toEqual({
            items: [
                {
                    id: shipment.id,
                    expeditionNumber: "00435394",
                    status: "label_ready",
                    trackingUrl:
                        "https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=00435394&codePostal=76930",
                    deliveryRelayLocation: "FR-031270",
                    latestEventLabel: "Disponible au Point Relais",
                    latestEventAt: "2026-07-14T11:00:00.000Z",
                    carrierAcceptedAt: "2026-07-13T08:00:00.000Z",
                    sellerHandoffDeclaredAt: null,
                    recipientHandoffAt: null,
                    createdAt: "2026-07-02T10:00:00.000Z",
                    events: expected.events,
                },
            ],
        });
        expect(harness.postgrestRequests().map((request) => [request.method, request.pathname])).toEqual([
            ["GET", "/rest/v1/shipments"],
        ]);
        expect(harness.postgrestRequests()[0]?.searchParams).toMatchObject({
            external_order_id: "eq.order-1001",
            order: "created_at.desc",
            "events.order": "occurred_at.desc.nullslast,created_at.desc",
        });
        const externalOrderSelect = harness.postgrestRequests()[0]?.searchParams.select ?? "";
        for (const privateField of [
            "recipient_name",
            "recipient_email",
            "recipient_phone",
            "recipient_address",
            "recipient_postal_code",
            "recipient_city",
            "recipient_country",
            "sender_",
            "raw_",
        ]) {
            expect(externalOrderSelect).not.toContain(privateField);
        }
        expect(harness.providerRequests()).toEqual([]);

        harness.resetRequestHistory();
        const forbiddenExternalOrderLookup = await sourceRequest(harness, "shipmentForExternalOrder", {
            method: "GET",
            userId: "member-1",
            userRole: "member",
            enforceAccess: true,
            params: { externalOrderId: "order-1001" },
        });
        expect(forbiddenExternalOrderLookup.status).toBe(403);
        expect(await forbiddenExternalOrderLookup.text()).toBe("Forbidden");
        expect(harness.postgrestRequests()).toEqual([]);
        expect(harness.providerRequests()).toEqual([]);

        for (const caller of [
            { userId: "", userRole: "member", status: 401, body: "Unauthorized" },
            { userId: "member-1", userRole: "member", status: 403, body: "Forbidden" },
        ]) {
            harness.resetRequestHistory();
            const response = await sourceRequest(harness, "shipment", {
                method: "GET",
                userId: caller.userId,
                userRole: caller.userRole,
                enforceAccess: true,
                params: { id: String(shipment.id) },
            });
            expect(response.status).toBe(caller.status);
            expect(await response.text()).toBe(caller.body);
            expect(harness.postgrestRequests()).toEqual([]);
            expect(harness.providerRequests()).toEqual([]);
        }

        const missingHarness = await createHarness();
        const missing = await sourceRequest(missingHarness, "shipment", {
            method: "GET",
            userId: "admin-1",
            userRole: "admin",
            enforceAccess: true,
            responseProjectionMode: "compatibility",
            params: { id: "missing-shipment" },
        });
        expect(missing.status).toBe(404);
        expect(await jsonBody(missing)).toEqual({ error: "shipment not found" });
        expect(missingHarness.postgrestRequests().map((request) => [request.method, request.pathname])).toEqual([
            ["GET", "/rest/v1/shipments"],
        ]);
        expect(missingHarness.providerRequests()).toEqual([]);

        missingHarness.resetRequestHistory();
        const noShipmentForOrder = await sourceRequest(missingHarness, "shipmentForExternalOrder", {
            method: "GET",
            userId: "system",
            userRole: "system",
            enforceAccess: true,
            params: { externalOrderId: "order-without-shipment" },
        });
        expect(noShipmentForOrder.status).toBe(200);
        expect(await jsonBody(noShipmentForOrder)).toEqual({ items: [] });
        expect(missingHarness.postgrestRequests().map((request) => [request.method, request.pathname])).toEqual([
            ["GET", "/rest/v1/shipments"],
        ]);
        expect(missingHarness.providerRequests()).toEqual([]);
    });

    test("keeps explicit empty flat seller fields when matching the immutable quote snapshot", async () => {
        const harness = await createHarness();
        const settingsResponse = await setSettings(harness, {
            senderAddressLine2: "GLOBAL ADDRESS LINE 2",
            senderAddressLine3: "GLOBAL ADDRESS LINE 3",
            senderEmail: "global-sender@example.test",
        });
        expect(settingsResponse.status).toBe(200);
        harness.deliveryQuotes[0]!.seller_fulfillment_snapshot = {
            ...(harness.deliveryQuotes[0]!.seller_fulfillment_snapshot as JsonRecord),
            addressLine2: "",
            addressLine3: "",
            email: "",
        };

        const response = await createShipment(harness, {
            ...validShipmentBody(),
            senderName: "Sender Shop",
            senderFirstName: "Sender",
            senderLastName: "Shop",
            senderEmail: "",
            senderPhone: "+33600000000",
            senderAddressLine1: "1 Rue Test",
            senderAddressLine2: "",
            senderAddressLine3: "",
            senderPostalCode: "75001",
            senderCity: "Paris",
            senderCountry: "FR",
        });

        expect(response.status).toBe(201);
        expect(harness.connectRequestXml()).not.toContain("GLOBAL ADDRESS LINE");
        expect(harness.connectRequestXml()).not.toContain("global-sender@example.test");
        expect(harness.insertedShipments[0]?.raw_request).toMatchObject({
            senderAddressLine2: "",
            senderAddressLine3: "",
            senderEmail: "",
        });
    });

    test("keeps explicit empty nested aliases and does not replace an empty required field", async () => {
        const nestedHarness = await createHarness();
        const settingsResponse = await setSettings(nestedHarness, {
            senderAddressLine2: "GLOBAL NESTED ADDRESS LINE 2",
            senderAddressLine3: "GLOBAL NESTED ADDRESS LINE 3",
            senderEmail: "global-nested@example.test",
        });
        expect(settingsResponse.status).toBe(200);
        nestedHarness.deliveryQuotes[0]!.seller_fulfillment_snapshot = {
            ...(nestedHarness.deliveryQuotes[0]!.seller_fulfillment_snapshot as JsonRecord),
            addressLine2: "",
            addressLine3: "",
            email: "",
        };

        const nestedResponse = await edgeCreateShipment(nestedHarness, {
            ...validShipmentBody(),
            sender: {
                name: "Sender Shop",
                firstname: "Sender",
                lastname: "Shop",
                email: "",
                phoneNo: "+33600000000",
                address1: "1 Rue Test",
                address2: "",
                address3: "",
                postal_code: "75001",
                city: "Paris",
                country: "FR",
            },
        });
        expect(nestedResponse.status).toBe(201);
        expect(nestedHarness.connectRequestXml()).not.toContain("GLOBAL NESTED ADDRESS LINE");
        expect(nestedHarness.connectRequestXml()).not.toContain("global-nested@example.test");

        const invalidHarness = await createHarness();
        const invalidResponse = await createShipment(invalidHarness, {
            ...validShipmentBody(),
            senderAddressLine1: "",
        });
        expect(invalidResponse.status).toBe(400);
        expect(await jsonBody(invalidResponse)).toEqual({ error: "sender.addressLine1 is required" });
        expect(invalidHarness.connectRequestCount()).toBe(0);
    });

    test("rejects non-official Connect endpoints before sending credentials", async () => {
        const blockedEndpoints = [
            "http://connect-api.mondialrelay.com/api/shipment",
            "https://127.0.0.1/api/shipment",
            "https://connect-api.mondialrelay.com:444/api/shipment",
            "https://user:password@connect-api.mondialrelay.com/api/shipment",
            "https://connect-api.mondialrelay.com.evil.example/api/shipment",
        ];

        for (const endpoint of blockedEndpoints) {
            const harness = await createHarness();
            activeEnv.MONDIAL_RELAY_CONNECT_ENDPOINT = endpoint;
            const response = await edgeCreateShipment(harness, validShipmentBody());
            expect(response.status).toBe(500);
            expect(await jsonBody(response)).toMatchObject({
                error: "Mondial Relay Connect endpoint is not an allowed official endpoint",
            });
            expect(harness.connectRequestCount()).toBe(0);
            expect(harness.upstreamRequestUrls()).not.toContain(endpoint);
        }
    });

    test("does not follow Mondial Relay Connect redirects", async () => {
        const harness = await createHarness({ connectRedirect: true });
        const response = await edgeCreateShipment(harness, validShipmentBody());

        expect(response.status).toBe(502);
        expect(await jsonBody(response)).toMatchObject({ error: "Mondial Relay Connect redirects are not allowed" });
        expect(harness.connectRequestCount()).toBe(1);
        expect(harness.connectRequestRedirect()).toBe("manual");
    });

    test("replays a completed shipment without creating a second Mondial Relay shipment", async () => {
        const harness = await createHarness();
        const first = await createShipment(harness, validShipmentBody());
        harness.resetRequestHistory();
        const replay = await createShipment(harness, validShipmentBody());

        expect(first.status).toBe(201);
        expect(replay.status).toBe(200);
        expect(await jsonBody(replay)).toEqual({
            ok: true,
            id: harness.insertedShipments[0]?.id,
            expeditionNumber: "00435394",
            trackingUrl: "https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=00435394&codePostal=76930",
            status: "label_ready",
            createdAt: "2026-07-02T10:00:00.000Z",
            idempotentReplay: true,
        });
        expect(harness.connectRequestCount()).toBe(1);
        expect(harness.insertedShipments).toHaveLength(1);
        expect(harness.postgrestRequests().map((request) => [request.method, request.pathname])).toEqual([
            ["GET", "/rest/v1/settings"],
            ["POST", "/rest/v1/rpc/reserve_shipment_creation"],
        ]);
        expect(harness.providerRequests()).toEqual([]);
    });

    test("rejects an immutable quote bound to another buyer before reserving or calling Connect", async () => {
        const harness = await createHarness();
        const response = await createShipment(harness, {
            ...validShipmentBody(),
            selectedForCmsUserId: "another-buyer",
        });

        expect(response.status).toBe(409);
        expect(await jsonBody(response)).toEqual({ error: "shipment delivery quote binding is invalid" });
        expect(harness.insertedShipments).toEqual([]);
        expect(harness.postgrestRequests().map((request) => [request.method, request.pathname])).toEqual([
            ["GET", "/rest/v1/settings"],
            ["POST", "/rest/v1/rpc/reserve_shipment_creation"],
        ]);
        expect(harness.providerRequests()).toEqual([]);
    });

    test("accepts the exact five-key Commerce metadata contract on lost-response recovery", async () => {
        const harness = await createHarness();
        const body = {
            ...validShipmentBody(),
            metadata: {
                commerceOrderId: "order-1001",
                financialTermsHash: "terms-hash-1001",
                deliveryQuoteId: `mrq_${"a".repeat(64)}`,
                declaredValueMinorAmount: 12_345,
                declaredCurrency: "EUR",
            },
        };
        const first = await createShipment(harness, body);
        const recovered = await createShipment(harness, { ...body, metadata: { ...body.metadata } });

        expect(first.status).toBe(201);
        expect(recovered.status).toBe(200);
        expect(await jsonBody(recovered)).toMatchObject({ idempotentReplay: true, expeditionNumber: "00435394" });
        expect(harness.connectRequestCount()).toBe(1);
    });

    test("rejects an idempotency replay when immutable shipment input changed", async () => {
        const harness = await createHarness();
        const first = await createShipment(harness, validShipmentBody());
        const changed = { ...validShipmentBody(), deliveryRelayLocation: "FR-024474" };
        const replay = await createShipment(harness, changed);

        expect(first.status).toBe(201);
        expect(replay.status).toBe(409);
        expect(await jsonBody(replay)).toMatchObject({
            error: "shipment financial or relay input does not match the immutable quote",
        });
        expect(harness.connectRequestCount()).toBe(1);
        expect(harness.insertedShipments).toHaveLength(1);
    });

    test("proxies labels only through a short-lived capability bound to the seller", async () => {
        const harness = await createHarness();
        const created = await jsonBody(await createShipment(harness, validShipmentBody()));
        expect(created).not.toHaveProperty("labelUrl");

        const issued = await jsonBody(
            await sourceRequest(harness, "issueLabelAccess", {
                method: "POST",
                userId: "seller-42",
                body: { externalOrderId: "order-1001", sellerCmsUserId: "seller-42" },
            }),
        );
        expect(issued.token).toEqual(expect.any(String));
        expect(harness.labelAccessTokens[0]).toMatchObject({
            shipment_id: harness.insertedShipments[0]?.id,
            seller_cms_user_id: "seller-42",
        });
        expect(JSON.stringify(harness.labelAccessTokens)).not.toContain(String(issued.token));

        const labelResponse = await sourceRequest(harness, "label", {
            method: "GET",
            userId: "seller-42",
            params: { token: String(issued.token) },
        });
        expect(labelResponse.status).toBe(200);
        expect(labelResponse.headers.get("cache-control")).toBe("private, no-store");
        expect(await labelResponse.text()).toContain("%PDF-1.4");
        const directLabelResponse = await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-delivery/label?token=${encodeURIComponent(String(issued.token))}`, {
                headers: {
                    authorization: `Bearer ${activeEnv.CMS_DELIVERY_API_KEY}`,
                    "x-cms-user-id": "seller-42",
                },
            }),
        );
        expect(directLabelResponse.headers.get("content-disposition")).toStartWith("attachment;");
        expect(directLabelResponse.headers.get("x-content-type-options")).toBe("nosniff");

        const otherSeller = await sourceRequest(harness, "label", {
            method: "GET",
            userId: "seller-other",
            params: { token: String(issued.token) },
        });
        expect(otherSeller.status).toBe(404);
        const unrelatedMint = await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-delivery/system/label-access`, {
                method: "POST",
                headers: {
                    authorization: `Bearer ${activeEnv.CMS_DELIVERY_API_KEY}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({ externalOrderId: "order-1001", sellerCmsUserId: "seller-other" }),
            }),
        );
        expect(unrelatedMint.status).toBe(404);
        expect(harness.labelAccessTokens).toHaveLength(1);
    });

    test("allows a label re-download after seller handoff but closes access on the first carrier scan", async () => {
        const harness = await createHarness();
        await createShipment(harness, validShipmentBody());
        await sourceRequest(harness, "declareSellerHandoff", {
            method: "POST",
            userId: "seller-42",
            body: { externalOrderId: "order-1001" },
        });

        const afterHandoff = await sourceRequest(harness, "issueLabelAccess", {
            method: "POST",
            userId: "seller-42",
            body: { externalOrderId: "order-1001", sellerCmsUserId: "seller-42" },
        });
        expect(afterHandoff.status).toBe(201);

        Object.assign(harness.insertedShipments[0]!, {
            status: "carrier_accepted",
            carrier_accepted_at: "2026-07-14T00:30:00.000Z",
        });
        const afterCarrierScan = await sourceRequest(harness, "issueLabelAccess", {
            method: "POST",
            userId: "seller-42",
            body: { externalOrderId: "order-1001", sellerCmsUserId: "seller-42" },
        });
        expect(afterCarrierScan.status).toBe(409);
    });

    test("atomically revokes existing label capabilities when an unscanned shipment is cancelled", async () => {
        const harness = await createHarness();
        await createShipment(harness, validShipmentBody());
        const capability = await jsonBody(
            await sourceRequest(harness, "issueLabelAccess", {
                method: "POST",
                userId: "seller-42",
                body: { externalOrderId: "order-1001", sellerCmsUserId: "seller-42" },
            }),
        );

        const cancellation = await sourceRequest(harness, "cancelShipmentReservation", {
            method: "POST",
            userId: "system",
            body: { externalOrderId: "order-1001", trackingUntil: "2099-07-12T09:30:00.000Z" },
        });
        expect(cancellation.status).toBe(200);
        expect(await jsonBody(cancellation)).toMatchObject({ status: "cancelled_unscanned" });
        expect(harness.labelAccessTokens).toEqual([expect.objectContaining({ revoked_at: expect.any(String) })]);

        const providerRequestCount = harness.upstreamRequestUrls.length;
        const revokedDownload = await sourceRequest(harness, "label", {
            method: "GET",
            userId: "seller-42",
            params: { token: String(capability.token) },
        });
        expect(revokedDownload.status).toBe(404);
        expect(harness.upstreamRequestUrls).toHaveLength(providerRequestCount);

        const mintAfterCancellation = await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-delivery/system/label-access`, {
                method: "POST",
                headers: {
                    authorization: `Bearer ${activeEnv.CMS_DELIVERY_API_KEY}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({ externalOrderId: "order-1001", sellerCmsUserId: "seller-42" }),
            }),
        );
        expect(mintAfterCancellation.status).toBe(409);
        expect(harness.labelAccessTokens.filter((token) => !token.revoked_at)).toHaveLength(0);
    });

    test("replays the exact terminal cancellation after its tracking deadline has expired", async () => {
        const harness = await createHarness();
        await createShipment(harness, validShipmentBody());
        await sourceRequest(harness, "cancelShipmentReservation", {
            method: "POST",
            userId: "system",
            body: { externalOrderId: "order-1001", trackingUntil: "2099-07-12T09:30:00.000Z" },
        });
        Object.assign(harness.insertedShipments[0]!, {
            status: "cancelled",
            cancellation_tracking_until: "2026-07-01T00:00:00.000Z",
        });

        const replay = await sourceRequest(harness, "cancelShipmentReservation", {
            method: "POST",
            userId: "system",
            body: { externalOrderId: "order-1001", trackingUntil: "2026-07-01T00:00:00.000Z" },
        });
        expect(replay.status).toBe(200);
        expect(await jsonBody(replay)).toMatchObject({ status: "cancelled" });

        const changedDeadline = await sourceRequest(harness, "cancelShipmentReservation", {
            method: "POST",
            userId: "system",
            body: { externalOrderId: "order-1001", trackingUntil: "2099-07-13T09:30:00.000Z" },
        });
        expect(changedDeadline.status).toBe(409);
    });

    test("refuses cancellation while a carrier reconciliation lease can observe the first scan", async () => {
        const harness = await createHarness();
        await createShipment(harness, validShipmentBody());
        Object.assign(harness.insertedShipments[0]!, {
            tracking_claimed_at: new Date().toISOString(),
            tracking_claimed_by: "active-first-scan-worker",
        });

        const cancellation = await sourceRequest(harness, "cancelShipmentReservation", {
            method: "POST",
            userId: "system",
            body: { externalOrderId: "order-1001", trackingUntil: "2099-07-12T09:30:00.000Z" },
        });
        expect(cancellation.status).toBe(409);
        expect(harness.insertedShipments[0]).toMatchObject({
            status: "label_ready",
            tracking_claimed_by: "active-first-scan-worker",
        });
    });

    test("keeps tracking a locally cancelled label and escalates a late carrier scan", async () => {
        const harness = await createHarness();
        await createShipment(harness, validShipmentBody());
        const cancellation = await sourceRequest(harness, "cancelShipmentReservation", {
            method: "POST",
            userId: "system",
            body: { externalOrderId: "order-1001", trackingUntil: "2099-07-12T09:30:00.000Z" },
        });
        expect(cancellation.status).toBe(200);

        const batch = await jsonBody(
            await sourceRequest(harness, "reconcileShipments", {
                method: "POST",
                userId: "system",
                body: { runKey: "cancelled-scan-worker", limit: 5 },
            }),
        );
        expect(batch.shipments).toEqual([
            expect.objectContaining({ externalOrderId: "order-1001", status: "manual_review" }),
        ]);
        expect(batch.events).toEqual([
            expect.objectContaining({
                orderPublicId: "order-1001",
                normalizedStatus: "arrived_at_pickup_point",
            }),
        ]);
        expect(harness.insertedShipments[0]).toMatchObject({
            status: "manual_review",
            last_error: "carrier activity or ambiguity observed after local shipment cancellation",
        });
    });

    test("keeps an expired local cancellation in manual review on STAT 83", async () => {
        const harness = await createHarness({ trackingStatusCode: "83" });
        await createShipment(harness, validShipmentBody());
        await sourceRequest(harness, "cancelShipmentReservation", {
            method: "POST",
            userId: "system",
            body: { externalOrderId: "order-1001", trackingUntil: "2099-07-12T09:30:00.000Z" },
        });
        harness.insertedShipments[0]!.cancellation_tracking_until = "2026-07-01T00:00:00.000Z";

        const batch = await jsonBody(
            await sourceRequest(harness, "reconcileShipments", {
                method: "POST",
                userId: "system",
                body: { runKey: "cancelled-stat83-worker", limit: 5 },
            }),
        );

        expect(batch.shipments).toEqual([
            expect.objectContaining({ externalOrderId: "order-1001", status: "manual_review" }),
        ]);
        expect(batch.events).toEqual([
            expect.objectContaining({ orderPublicId: "order-1001", normalizedStatus: "incident" }),
        ]);
        expect(harness.insertedShipments[0]).toMatchObject({
            status: "manual_review",
            incident_at: expect.any(String),
            last_error: "carrier activity or ambiguity observed after local shipment cancellation",
        });
    });

    test("keeps an expired local cancellation in manual review on ambiguous recipient evidence", async () => {
        for (const trackingEventLabel of [
            "Colis non remis au destinataire",
            "Colis remis au destinataire avec réserve",
        ]) {
            const harness = await createHarness({ trackingEventLabel });
            await createShipment(harness, validShipmentBody());
            await sourceRequest(harness, "cancelShipmentReservation", {
                method: "POST",
                userId: "system",
                body: { externalOrderId: "order-1001", trackingUntil: "2099-07-12T09:30:00.000Z" },
            });
            harness.insertedShipments[0]!.cancellation_tracking_until = "2026-07-01T00:00:00.000Z";

            const batch = await jsonBody(
                await sourceRequest(harness, "reconcileShipments", {
                    method: "POST",
                    userId: "system",
                    body: { runKey: `cancelled-ambiguous-worker-${trackingEventLabel}`, limit: 5 },
                }),
            );

            expect(batch.shipments).toEqual([
                expect.objectContaining({ externalOrderId: "order-1001", status: "manual_review" }),
            ]);
            expect(batch.events).toEqual([
                expect.objectContaining({ orderPublicId: "order-1001", normalizedStatus: "incident" }),
            ]);
            expect(harness.insertedShipments[0]).toMatchObject({
                status: "manual_review",
                incident_at: "2026-07-12T09:30:00.000Z",
            });
        }
    });

    test("never restores a pre-cancellation status when a neutral reconciliation loses the cancellation CAS", async () => {
        const harness = await createHarness({
            trackingStatusCode: "80",
            cancellationRaceOnReconciliation: "cancelled_unscanned",
        });
        await createShipment(harness, validShipmentBody());

        const batch = await jsonBody(
            await sourceRequest(harness, "reconcileShipments", {
                method: "POST",
                userId: "system",
                body: { runKey: "cancelled-neutral-cas-worker", limit: 5 },
            }),
        );

        expect(batch.shipments).toEqual([
            expect.objectContaining({ externalOrderId: "order-1001", status: "cancelled_unscanned" }),
        ]);
        expect(harness.insertedShipments[0]).toMatchObject({
            status: "cancelled_unscanned",
            cancellation_tracking_until: "2099-07-12T09:30:00.000Z",
            last_error: "cancellation committed during reconciliation",
            tracking_claimed_at: null,
            tracking_claimed_by: null,
        });
    });

    test("moves a cancellation CAS race to manual review when the late result is an incident", async () => {
        const harness = await createHarness({
            trackingStatusCode: "83",
            cancellationRaceOnReconciliation: "cancelled_unscanned",
        });
        await createShipment(harness, validShipmentBody());

        const batch = await jsonBody(
            await sourceRequest(harness, "reconcileShipments", {
                method: "POST",
                userId: "system",
                body: { runKey: "cancelled-incident-cas-worker", limit: 5 },
            }),
        );

        expect(batch.shipments).toEqual([
            expect.objectContaining({ externalOrderId: "order-1001", status: "manual_review" }),
        ]);
        expect(harness.insertedShipments[0]).toMatchObject({
            status: "manual_review",
            cancellation_tracking_until: "2099-07-12T09:30:00.000Z",
            last_error: "carrier activity or ambiguity raced with local shipment cancellation",
            incident_at: expect.any(String),
        });
    });

    test("synchronizes and stores tracking events through the official SOAP WebService", async () => {
        const harness = await createHarness();
        await createShipment(harness, validShipmentBody());
        const response = await tracking(harness, "00435394");
        const body = await jsonBody(response);

        expect(response.status).toBe(200);
        expect(body).toMatchObject({
            expeditionNumber: "00435394",
            status: "arrived_at_pickup_point",
            latestEventLabel: "Colis livré au destinataire",
            recipientHandoffAt: "",
        });
        expect(body.events).toHaveLength(2);
        expect(body.events[0]).toMatchObject({
            eventLabel: "Livré",
            eventDate: "2026-07-12",
            eventTime: "11:30",
            location: "PARIS",
        });
        expect(body.events[0]).not.toHaveProperty("projectionClaimToken");
        expect(body.events[0]).not.toHaveProperty("projectionStatus");
        expect(body.events[0]).not.toHaveProperty("projectionLastError");
        expect(body.events[0]).not.toHaveProperty("providerEventKey");
        expect(harness.trackingRequestXml()).toContain("<Enseigne>BDTEST</Enseigne>");
        expect(harness.trackingRequestXml()).toContain("<Expedition>00435394</Expedition>");
        expect(harness.trackingRequestXml()).toMatch(/<Security>[A-F0-9]{32}<\/Security>/);
        expect(harness.trackingRequestXml()).not.toContain("tracking-private-key");
        expect(harness.insertedShipments[0]).toMatchObject({ status: "arrived_at_pickup_point" });
        // Keep the raw provider event for auditability and persist the conservative
        // normalized summary as a separate Commerce projection event.
        expect(harness.shipmentEvents).toHaveLength(2);

        const cached = await tracking(harness, "00435394");
        expect(cached.status).toBe(200);
        expect(harness.trackingRequestCount()).toBe(1);
    });

    test("rejects non-official tracking endpoints before sending the signed SOAP request", async () => {
        const blockedEndpoints = [
            "http://api.mondialrelay.com/WebService.asmx",
            "https://127.0.0.1/WebService.asmx",
            "https://api.mondialrelay.com:444/WebService.asmx",
            "https://brand:key@api.mondialrelay.com/WebService.asmx",
            "https://api.mondialrelay.com.evil.example/WebService.asmx",
        ];

        for (const endpoint of blockedEndpoints) {
            const harness = await createHarness();
            await createShipment(harness, validShipmentBody());
            activeEnv.MONDIAL_RELAY_TRACKING_ENDPOINT = endpoint;
            const response = await edgeTracking(harness, "00435394");
            expect(response.status).toBe(500);
            expect(await jsonBody(response)).toMatchObject({
                error: "Mondial Relay tracking endpoint is not an allowed official endpoint",
            });
            expect(harness.trackingRequestCount()).toBe(0);
            expect(harness.upstreamRequestUrls()).not.toContain(endpoint);
        }
    });

    test("does not follow Mondial Relay tracking redirects", async () => {
        const harness = await createHarness({ trackingRedirect: true });
        await createShipment(harness, validShipmentBody());
        const response = await edgeTracking(harness, "00435394");

        expect(response.status).toBe(502);
        expect(await jsonBody(response)).toMatchObject({ error: "Mondial Relay tracking redirects are not allowed" });
        expect(harness.trackingRequestCount()).toBe(1);
        expect(harness.trackingRequestRedirect()).toBe("manual");
    });

    test("records recipient_handoff_at only from an explicit dated collection event", async () => {
        const harness = await createHarness({ trackingEventLabel: "Colis remis au destinataire" });
        await createShipment(harness, validShipmentBody());
        const body = await jsonBody(await tracking(harness, "00435394"));

        expect(body).toMatchObject({
            status: "collected_by_recipient",
            recipientHandoffAt: "2026-07-12T09:30:00.000Z",
        });
        expect(harness.insertedShipments[0]).toMatchObject({
            status: "collected_by_recipient",
            recipient_handoff_at: "2026-07-12T09:30:00.000Z",
        });
        expect(body.events[0]).toMatchObject({
            normalizedStatus: "collected_by_recipient",
            occurredAt: "2026-07-12T09:30:00.000Z",
        });
    });

    test("keeps seller handoff separate from first scan and closes cancellation races", async () => {
        const harness = await createHarness();
        await createShipment(harness, validShipmentBody());
        const handoff = await jsonBody(
            await sourceRequest(harness, "declareSellerHandoff", {
                method: "POST",
                userId: "seller-42",
                body: { externalOrderId: "order-1001" },
            }),
        );
        expect(handoff).toMatchObject({
            status: "label_ready",
            sellerHandoffDeclaredAt: expect.any(String),
        });
        expect(handoff.carrierAcceptedAt).toBeUndefined();

        const cancellation = await sourceRequest(harness, "cancelShipmentReservation", {
            method: "POST",
            userId: "system",
            body: { externalOrderId: "order-1001", trackingUntil: "2099-07-12T09:30:00.000Z" },
        });
        expect(cancellation.status).toBe(409);

        const batch = await jsonBody(
            await sourceRequest(harness, "reconcileShipments", {
                method: "POST",
                userId: "system",
                body: { runKey: "delivery-worker-1", limit: 25 },
            }),
        );
        expect(batch.processed).toBe(1);
        expect(batch.events).toEqual([
            expect.objectContaining({
                orderPublicId: "order-1001",
                normalizedStatus: "arrived_at_pickup_point",
                providerReference: "00435394",
            }),
        ]);
        const event = batch.events[0] as JsonRecord;
        const acknowledged = await jsonBody(
            await sourceRequest(harness, "acknowledgeShipmentEvent", {
                method: "POST",
                userId: "system",
                body: { eventId: event.eventId, claimToken: event.claimToken },
            }),
        );
        expect(acknowledged).toEqual({ acknowledged: true });
        const replay = await jsonBody(
            await sourceRequest(harness, "reconcileShipments", {
                method: "POST",
                userId: "system",
                body: { runKey: "delivery-worker-2", limit: 24 },
            }),
        );
        expect(replay.events).toEqual([]);
    });

    test("leases projection events, reclaims crashes, and dead-letters repeated failures", async () => {
        const harness = await createHarness();
        await createShipment(harness, validShipmentBody());
        const first = await jsonBody(
            await sourceRequest(harness, "reconcileShipments", {
                method: "POST",
                userId: "system",
                body: { runKey: "projection-worker-a", limit: 8 },
            }),
        );
        const claimed = first.events[0] as JsonRecord;
        expect(typeof claimed.eventId).toBe("number");
        expect(typeof claimed.claimToken).toBe("string");
        expect(claimed.projectionAttempts).toBe(1);

        const concurrent = await jsonBody(
            await sourceRequest(harness, "reconcileShipments", {
                method: "POST",
                userId: "system",
                body: { runKey: "projection-worker-b", limit: 8 },
            }),
        );
        expect(concurrent.events).toEqual([]);

        const stored = harness.shipmentEvents.find((event) => Number(event.id) === Number(claimed.eventId))!;
        if (!stored) {
            throw new Error("claimed projection event is missing from the harness");
        }
        stored.projection_claimed_at = "stale";
        const reclaimed = await jsonBody(
            await sourceRequest(harness, "reconcileShipments", {
                method: "POST",
                userId: "system",
                body: { runKey: "projection-worker-c", limit: 8 },
            }),
        );
        expect(reclaimed.events[0]).toMatchObject({
            eventId: claimed.eventId,
            projectionAttempts: 2,
        });
        expect((reclaimed.events[0] as JsonRecord).claimToken).not.toBe(claimed.claimToken);

        const retry = await jsonBody(
            await sourceRequest(harness, "failShipmentEventProjection", {
                method: "POST",
                userId: "system",
                body: {
                    eventId: claimed.eventId,
                    claimToken: (reclaimed.events[0] as JsonRecord).claimToken,
                    error: "Commerce temporarily unavailable",
                },
            }),
        );
        expect(retry).toMatchObject({ projectionStatus: "retry_wait", projectionAttempts: 2 });

        const finalClaim = await jsonBody(
            await sourceRequest(harness, "reconcileShipments", {
                method: "POST",
                userId: "system",
                body: { runKey: "projection-worker-d", limit: 8 },
            }),
        );
        stored.projection_attempts = 5;
        const manual = await jsonBody(
            await sourceRequest(harness, "failShipmentEventProjection", {
                method: "POST",
                userId: "system",
                body: {
                    eventId: claimed.eventId,
                    claimToken: (finalClaim.events[0] as JsonRecord).claimToken,
                    error: "Commerce permanently rejected the projection",
                },
            }),
        );
        expect(manual).toMatchObject({
            projectionStatus: "manual_review",
            projectionAttempts: 5,
            projectionLastError: "Commerce permanently rejected the projection",
        });

        const exceptions = await jsonBody(
            await sourceRequest(harness, "shipmentProjectionExceptions", {
                method: "GET",
                userId: "admin",
                params: { limit: "50", offset: "0" },
            }),
        );
        expect(exceptions.items).toEqual([
            expect.objectContaining({
                id: claimed.eventId,
                projectionStatus: "manual_review",
                projectionAttempts: 5,
            }),
        ]);

        const forbidden = await sourceRequest(harness, "reviewShipmentProjectionException", {
            method: "POST",
            userId: "legacy-support-operator",
            userRole: "support",
            body: {
                eventId: claimed.eventId,
                action: "requeue",
                reason: "Commerce projection endpoint has recovered",
            },
        });
        expect(forbidden.status).toBe(403);

        const requeued = await sourceRequest(harness, "reviewShipmentProjectionException", {
            method: "POST",
            userId: "admin-operator",
            userRole: "admin",
            body: {
                eventId: claimed.eventId,
                action: "requeue",
                reason: "Commerce projection endpoint has recovered",
            },
        });
        expect(requeued.status).toBe(200);
        expect(await jsonBody(requeued)).toMatchObject({
            id: claimed.eventId,
            projectionStatus: "retry_wait",
            projectionAttempts: 0,
        });
        expect(stored.normalized_status).toBe("arrived_at_pickup_point");
    });

    test("revalidates and stores a checkout relay selection without creating a shipment", async () => {
        const harness = await createHarness();
        const savedResponse = await saveRelaySelection(harness, {
            ...validDeliveryQuoteRequest("order-public-42"),
            externalOrderId: "order-public-42",
            relayLocation: "FR-034439",
            country: "FR",
            postalCode: "75001",
            city: "Paris",
        });
        const saved = await jsonBody(savedResponse);

        expect(savedResponse.status).toBe(200);
        expect(saved).toEqual({
            quoteId: "mrq_12a24601fa17ea51f8af4b4a33a43c932d1c638945fda05f283ac297fa161054",
            externalOrderId: "order-public-42",
            orderVersion: 1,
            revision: 1,
            selectedForCmsUserId: "user-123",
            relayLocation: "FR-034439",
            country: "FR",
            number: "034439",
            name: "ARS INFORMATIQUE",
            addressLine1: "38 RUE MAUCONSEIL",
            addressLine2: "",
            postalCode: "75001",
            city: "PARIS",
            latitude: 48.8641433,
            longitude: 2.3470309,
            nature: "1",
            pointType: "relay_point",
            weightGrams: 500,
            shippingAmount: 450,
            currency: "eur",
            merchandiseSubtotalMinorAmount: 12_345,
            quotedAt: "2026-07-13T10:00:00.000Z",
            expiresAt: "2099-07-13T10:15:00.000Z",
        });
        expect(harness.postgrestRequests().map((request) => [request.method, request.pathname])).toEqual([
            ["GET", "/rest/v1/shipments"],
            ["GET", "/rest/v1/settings"],
            ["POST", "/rest/v1/rpc/reserve_delivery_quote"],
        ]);
        expect(harness.providerRequests().map((request) => [request.method, request.pathname])).toEqual([
            ["GET", "/parcelshop-picker/v4_0/services/parcelshop-picker.svc/SearchPR"],
        ]);
        expect(harness.fetchTimeline()).toEqual([
            { kind: "postgrest", method: "GET", pathname: "/rest/v1/shipments" },
            { kind: "postgrest", method: "GET", pathname: "/rest/v1/settings" },
            {
                kind: "provider",
                method: "GET",
                pathname: "/parcelshop-picker/v4_0/services/parcelshop-picker.svc/SearchPR",
            },
            { kind: "postgrest", method: "POST", pathname: "/rest/v1/rpc/reserve_delivery_quote" },
        ]);
        expect(
            harness.postgrestRequests().filter((request) => request.pathname === "/rest/v1/delivery_quotes"),
        ).toEqual([]);
        expect(harness.postgrestRequests()[2]?.body).toMatchObject({
            p_quote_id: "mrq_12a24601fa17ea51f8af4b4a33a43c932d1c638945fda05f283ac297fa161054",
            p_request_key: "quote-request:order-public-42:1:FR-034439",
            p_external_order_id: "order-public-42",
            p_order_version: 1,
            p_selected_by: "user-123",
            p_selected_for_cms_user_id: "user-123",
            p_relay_location: "FR-034439",
            p_weight_grams: 500,
            p_shipping_amount: 450,
            p_currency: "eur",
            p_merchandise_subtotal_minor_amount: 12_345,
            p_ttl_seconds: 900,
        });

        harness.resetRequestHistory();
        const loaded = await jsonBody(await relaySelection(harness, "order-public-42"));
        expect(loaded).toMatchObject({
            externalOrderId: "order-public-42",
            relayLocation: "FR-034439",
            name: "ARS INFORMATIQUE",
            nature: "1",
            pointType: "relay_point",
            weightGrams: 500,
            shippingAmount: 450,
            currency: "eur",
        });
        expect(harness.postgrestRequests().map((request) => [request.method, request.pathname])).toEqual([
            ["POST", "/rest/v1/rpc/read_relay_selection_context"],
        ]);
        expect(harness.relaySelections).toHaveLength(0);
        expect(harness.deliveryQuotes).toContainEqual(
            expect.objectContaining({
                external_order_id: "order-public-42",
                relay_location: "FR-034439",
                relay_name: "ARS INFORMATIQUE",
                selected_by: "user-123",
                weight_grams: 500,
                shipping_amount: 450,
                currency: "eur",
            }),
        );
        expect(harness.relayLookupUrl()?.searchParams.get("NbResults")).toBe("8");
        expect(harness.insertedShipments).toHaveLength(0);

        const unavailable = await saveRelaySelection(harness, {
            ...validDeliveryQuoteRequest("order-public-43"),
            externalOrderId: "order-public-43",
            relayLocation: "FR-999999",
            country: "FR",
            postalCode: "75001",
        });
        expect(unavailable.status).toBe(409);
        expect(await jsonBody(unavailable)).toEqual({
            error: "the selected pickup point is unavailable or does not match the search area",
        });
        expect(harness.deliveryQuotes.filter((row) => row.external_order_id === "order-public-43")).toHaveLength(0);

        const locker = await saveRelaySelection(harness, {
            ...validDeliveryQuoteRequest("order-public-locker"),
            externalOrderId: "order-public-locker",
            relayLocation: "FR-024474",
            country: "FR",
            postalCode: "75001",
            city: "Paris",
        });
        expect(locker.status).toBe(409);
        expect(await jsonBody(locker)).toEqual({
            error: "the selected pickup point is unavailable or does not match the search area",
        });
        expect(harness.deliveryQuotes.filter((row) => row.external_order_id === "order-public-locker")).toHaveLength(0);
    });

    test("normalizes Commerce buyer names from given/surname and first/last fields", async () => {
        const cases = [
            {
                input: { givenName: "Alice", surname: "Acheteuse" },
                expected: ["Alice Acheteuse", "Alice", "Acheteuse"],
            },
            { input: { firstName: "Benoit", lastName: "Client" }, expected: ["Benoit Client", "Benoit", "Client"] },
        ] as const;

        for (const [index, testCase] of cases.entries()) {
            const externalOrderId = `order-buyer-name-${index + 1}`;
            const harness = await createHarness();
            const base = validDeliveryQuoteRequest(externalOrderId);
            const response = await saveRelaySelection(harness, {
                ...base,
                externalOrderId,
                relayLocation: "FR-034439",
                country: "FR",
                postalCode: "75001",
                city: "Paris",
                recipientSnapshot: {
                    ...testCase.input,
                    phone: "+33600000000",
                    addressLine1: "17B Chemin du Fond du Val",
                    addressLine2: "",
                    addressLine3: "",
                    postalCode: "76930",
                    city: "Octeville-sur-Mer",
                    countryCode: "FR",
                    email: "recipient@example.test",
                },
            });

            expect(response.status).toBe(200);
            expect(harness.deliveryQuotes).toContainEqual(
                expect.objectContaining({
                    external_order_id: externalOrderId,
                    recipient_snapshot: expect.objectContaining({
                        name: testCase.expected[0],
                        firstName: testCase.expected[1],
                        lastName: testCase.expected[2],
                    }),
                }),
            );
        }
    });

    test("strictly replays one immutable quote and rejects changed profiles under the same request key", async () => {
        const harness = await createHarness();
        const request = {
            ...validDeliveryQuoteRequest("order-public-42"),
            externalOrderId: "order-public-42",
            relayLocation: "FR-034439",
            country: "FR",
            postalCode: "75001",
            city: "Paris",
        };

        const first = await jsonBody(await saveRelaySelection(harness, request));
        const replay = await jsonBody(await saveRelaySelection(harness, request));
        const changed = await saveRelaySelection(harness, {
            ...request,
            sellerFulfillmentSnapshot: {
                ...(request.sellerFulfillmentSnapshot as JsonRecord),
                addressLine1: "99 rue modifiée après la première tentative",
            },
        });

        expect(replay.quoteId).toBe(first.quoteId);
        expect(replay.revision).toBe(first.revision);
        expect(harness.deliveryQuotes.filter((row) => row.external_order_id === "order-public-42")).toHaveLength(1);
        expect(changed.status).toBe(409);
        expect(await jsonBody(changed)).toMatchObject({
            error: expect.stringContaining("replay changed immutable input"),
        });
    });

    test("rejects incomplete buyer or seller fulfillment data before creating any quote", async () => {
        const cases: Array<[string, JsonRecord]> = [
            [
                "buyer",
                {
                    recipient: "Buyer",
                    phone: "",
                    addressLine1: "1 rue",
                    postalCode: "75001",
                    city: "Paris",
                    countryCode: "FR",
                },
            ],
            [
                "seller",
                {
                    givenName: "Seller",
                    surname: "Name",
                    phone: "+33611111111",
                    addressLine1: "",
                    postalCode: "69001",
                    city: "Lyon",
                    countryCode: "FR",
                },
            ],
        ];
        for (const [kind, incomplete] of cases) {
            const harness = await createHarness();
            const base = validDeliveryQuoteRequest(`order-incomplete-${kind}`);
            const response = await saveRelaySelection(harness, {
                ...base,
                externalOrderId: `order-incomplete-${kind}`,
                relayLocation: "FR-034439",
                country: "FR",
                postalCode: "75001",
                city: "Paris",
                ...(kind === "buyer" ? { recipientSnapshot: incomplete } : { sellerFulfillmentSnapshot: incomplete }),
            });
            expect(response.status).toBe(409);
            expect(
                harness.deliveryQuotes.filter((row) => row.external_order_id === `order-incomplete-${kind}`),
            ).toHaveLength(0);
            expect(harness.connectRequestCount()).toBe(0);
        }
    });

    test("fails closed when an exact quote is expired or bound to another buyer", async () => {
        const harness = await createHarness();
        harness.deliveryQuotes[0]!.expires_at = "2020-01-01T00:00:00.000Z";
        const expired = await sourceRequest(harness, "resolveDeliveryQuote", {
            method: "POST",
            userId: "system",
            body: {
                quoteId: harness.deliveryQuotes[0]!.quote_id,
                externalOrderId: "order-1001",
                selectedForCmsUserId: "user-123",
                purpose: "financial_lock",
            },
        });
        const wrongBuyer = await sourceRequest(harness, "resolveDeliveryQuote", {
            method: "POST",
            userId: "system",
            body: {
                quoteId: harness.deliveryQuotes[0]!.quote_id,
                externalOrderId: "order-1001",
                selectedForCmsUserId: "other-buyer",
                purpose: "fulfillment",
            },
        });

        expect(expired.status).toBe(409);
        expect(wrongBuyer.status).toBe(404);
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
        const fetched = await jsonBody(
            await sourceRequest(harness, "setting", {
                method: "GET",
                userId: "cms-admin",
                params: { id: "default" },
            }),
        );

        expect(response.status).toBe(200);
        expect(body).toMatchObject({
            id: "default",
            senderName: "Updated Shop",
            senderPhone: "+33608138404",
            defaultWeightGrams: 750,
        });
        expect(body).toEqual(fetched);

        harness.deliveryQuotes[0]!.seller_fulfillment_snapshot = {
            name: "Updated Shop",
            firstName: "Updated",
            lastName: "Shop",
            phone: "+33608138404",
            addressLine1: "2 Rue Test",
            addressLine2: "",
            addressLine3: "",
            postalCode: "69001",
            city: "Lyon",
            country: "FR",
            email: "sender@example.test",
        };
        (harness.deliveryQuotes[0]!.recipient_snapshot as JsonRecord).phone = "+33608138404";

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
        expect(body).toEqual({
            error: "Upstream request failed",
            correlationId: response.headers.get("x-correlation-id"),
        });
        expect(JSON.stringify(body)).not.toContain("connect-password");
        expect(JSON.stringify(body)).not.toContain(connectEndpoint);
        expect(JSON.stringify(body)).not.toContain("TTMRSDBX");
        expect(harness.insertedShipments).toHaveLength(1);
        expect(harness.insertedShipments[0]).toMatchObject({
            status: "failed",
            last_error: "Mondial Relay Connect returned status 10001: Invalid login or password",
        });
    });

    test("retries one explicit provider rejection through the same reserved shipment", async () => {
        const harness = await createHarness({
            connectResponses: [
                { code: "10001", level: "Error", message: "Temporary provider rejection" },
                { code: "0", level: "Info", message: "Success" },
            ],
        });
        const first = await createShipment(harness, validShipmentBody());
        const shipmentId = harness.insertedShipments[0]?.id;
        const retry = await createShipment(harness, validShipmentBody());

        expect(first.status).toBe(502);
        expect(await jsonBody(first)).toEqual({
            error: "Upstream request failed",
            correlationId: first.headers.get("x-correlation-id"),
        });
        expect(retry.status).toBe(201);
        expect(await jsonBody(retry)).toEqual({
            ok: true,
            id: shipmentId,
            expeditionNumber: "00435394",
            trackingUrl: "https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=00435394&codePostal=76930",
            status: "label_ready",
            createdAt: "2026-07-02T10:00:00.000Z",
        });
        expect(harness.connectRequestCount()).toBe(2);
        expect(harness.insertedShipments).toHaveLength(1);
        expect(harness.insertedShipments[0]).toMatchObject({
            id: shipmentId,
            status: "label_ready",
            expedition_number: "00435394",
            last_error: null,
        });
    });

    test("does not automatically retry an ambiguous Connect network failure", async () => {
        const harness = await createHarness({ connectNetworkError: true });
        const first = await createShipment(harness, validShipmentBody());
        const retry = await createShipment(harness, validShipmentBody());

        expect(first.status).toBe(502);
        expect(await jsonBody(first)).toEqual({
            error: "Upstream request failed",
            correlationId: first.headers.get("x-correlation-id"),
        });
        expect(retry.status).toBe(409);
        expect(await jsonBody(retry)).toEqual({
            error: "shipment creation outcome is unknown and requires reconciliation",
        });
        expect(harness.connectRequestCount()).toBe(1);
        expect(harness.insertedShipments[0]).toMatchObject({
            status: "unknown",
            last_error: "Mondial Relay Connect request failed",
        });

        const recovered = await sourceRequest(harness, "recoverUnknownShipment", {
            method: "POST",
            userId: "admin-7",
            body: {
                shipmentId: String(harness.insertedShipments[0]?.id),
                externalOrderId: "order-1001",
                expeditionNumber: "87654321",
                reason: "Matched against the provider back office after the timeout",
            },
        });
        expect(recovered.status).toBe(200);
        expect(await jsonBody(recovered)).toMatchObject({
            externalOrderId: "order-1001",
            expeditionNumber: "87654321",
            status: "created",
        });
        expect(harness.shipmentRecoveryEvents).toEqual([
            expect.objectContaining({
                actor_cms_user_id: "admin-7",
                previous_status: "unknown",
                expedition_number: "87654321",
            }),
        ]);

        const replay = await sourceRequest(harness, "recoverUnknownShipment", {
            method: "POST",
            userId: "admin-7",
            body: {
                shipmentId: String(harness.insertedShipments[0]?.id),
                externalOrderId: "order-1001",
                expeditionNumber: "87654321",
                reason: "Retry after the first recovery response was lost",
            },
        });
        expect(replay.status).toBe(200);
        expect(await jsonBody(replay)).toMatchObject({
            externalOrderId: "order-1001",
            expeditionNumber: "87654321",
            status: "created",
            idempotentReplay: true,
        });
        expect(harness.shipmentRecoveryEvents).toHaveLength(1);
        expect(harness.connectRequestCount()).toBe(1);
    });

    test("quarantines a stale in-progress creation before any second provider call", async () => {
        const harness = await createHarness();
        harness.insertedShipments.push(inProgressShipment("2020-01-01T00:00:00.000Z"));

        const response = await createShipment(harness, validShipmentBody());

        expect(response.status).toBe(409);
        expect(await jsonBody(response)).toEqual({
            error: "shipment creation outcome is unknown and requires administrator recovery",
        });
        expect(harness.connectRequestCount()).toBe(0);
        expect(harness.insertedShipments).toHaveLength(1);
        expect(harness.insertedShipments[0]).toMatchObject({
            status: "unknown",
            creation_manual_review_at: expect.any(String),
            last_error: "shipment creation lease expired before a provider outcome was attached",
        });
    });

    test("keeps the Edge-clock creation lease boundary and recovery failure behavior", async () => {
        const now = new Date("2026-07-21T12:00:00.000Z");
        setSystemTime(now);
        try {
            const live = await createHarness();
            live.insertedShipments.push(inProgressShipment(new Date(now.getTime() - 20 * 60_000 + 1).toISOString()));
            const liveResponse = await createShipment(live, validShipmentBody());
            expect(liveResponse.status).toBe(409);
            expect(await jsonBody(liveResponse)).toEqual({
                error: "shipment creation is already in progress",
            });
            expect(live.postgrestRequests().map((request) => [request.method, request.pathname])).toEqual([
                ["GET", "/rest/v1/settings"],
                ["POST", "/rest/v1/rpc/reserve_shipment_creation"],
            ]);
            expect(live.insertedShipments[0]?.status).toBe("creating");

            const stale = await createHarness();
            stale.insertedShipments.push(inProgressShipment(new Date(now.getTime() - 20 * 60_000).toISOString()));
            const staleResponse = await createShipment(stale, validShipmentBody());
            expect(staleResponse.status).toBe(409);
            expect(await jsonBody(staleResponse)).toEqual({
                error: "shipment creation outcome is unknown and requires administrator recovery",
            });
            expect(stale.postgrestRequests().map((request) => [request.method, request.pathname])).toEqual([
                ["GET", "/rest/v1/settings"],
                ["POST", "/rest/v1/rpc/reserve_shipment_creation"],
                ["PATCH", "/rest/v1/shipments"],
            ]);
            expect(stale.insertedShipments[0]).toMatchObject({
                status: "unknown",
                creation_manual_review_at: now.toISOString(),
                last_error: "shipment creation lease expired before a provider outcome was attached",
            });
            expect(stale.providerRequests()).toEqual([]);

            for (const option of ["miss", "failure"] as const) {
                const harness = await createHarness(
                    option === "miss" ? { shipmentLeasePatchMiss: true } : { shipmentLeasePatchFailure: true },
                );
                harness.insertedShipments.push(inProgressShipment(new Date(now.getTime() - 20 * 60_000).toISOString()));
                const response = await createShipment(harness, validShipmentBody());
                expect(response.status).toBe(409);
                expect(await jsonBody(response)).toEqual({
                    error: "shipment creation outcome is unknown and requires administrator recovery",
                });
                expect(harness.insertedShipments[0]?.status).toBe("creating");
                expect(harness.postgrestRequests().map((request) => [request.method, request.pathname])).toEqual([
                    ["GET", "/rest/v1/settings"],
                    ["POST", "/rest/v1/rpc/reserve_shipment_creation"],
                    ["PATCH", "/rest/v1/shipments"],
                ]);
                expect(harness.providerRequests()).toEqual([]);
            }
        } finally {
            setSystemTime();
        }
    });

    test("moves stale creating reservations to visible manual review without retrying the provider", async () => {
        const harness = await createHarness();
        harness.insertedShipments.push(
            {
                id: "shipment-stale",
                external_order_id: "order-stale",
                idempotency_key: "order-stale",
                status: "creating",
                provider_call_started_at: "2020-01-01T00:00:00.000Z",
                creation_manual_review_at: null,
                expedition_number: null,
                created_at: "2020-01-01T00:00:00.000Z",
                updated_at: "2020-01-01T00:00:00.000Z",
            },
            {
                id: "shipment-live",
                external_order_id: "order-live",
                idempotency_key: "order-live",
                status: "creating",
                provider_call_started_at: new Date().toISOString(),
                creation_manual_review_at: null,
                expedition_number: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            },
        );

        const response = await sourceRequest(harness, "reconcileShipments", {
            method: "POST",
            userId: "system",
            body: { runKey: "creation-lease-audit", limit: 8 },
        });
        const body = await jsonBody(response);

        expect(response.status).toBe(200);
        expect(body.staleCreations).toEqual([
            expect.objectContaining({
                id: "shipment-stale",
                externalOrderId: "order-stale",
                status: "unknown",
            }),
        ]);
        expect(harness.insertedShipments.find((row) => row.id === "shipment-stale")).toMatchObject({
            status: "unknown",
            creation_manual_review_at: expect.any(String),
        });
        expect(harness.insertedShipments.find((row) => row.id === "shipment-live")?.status).toBe("creating");
        expect(harness.connectRequestCount()).toBe(0);
    });

    test("rejects non-provider label URLs and non-PDF label responses", async () => {
        const invalidUrlHarness = await createHarness({ labelUrl: "https://internal.example.test/admin" });
        const invalidCreation = await createShipment(invalidUrlHarness, validShipmentBody());
        expect(invalidCreation.status).toBe(400);
        expect(invalidUrlHarness.insertedShipments).toHaveLength(1);
        expect(invalidUrlHarness.insertedShipments[0]).toMatchObject({
            status: "unknown",
            last_error: "Mondial Relay label URL is not an allowed provider URL",
        });

        const htmlHarness = await createHarness({ labelContentType: "text/html" });
        await createShipment(htmlHarness, validShipmentBody());
        const issued = await jsonBody(
            await sourceRequest(htmlHarness, "issueLabelAccess", {
                method: "POST",
                userId: "seller-42",
                body: { externalOrderId: "order-1001", sellerCmsUserId: "seller-42" },
            }),
        );
        const response = await sourceRequest(htmlHarness, "label", {
            method: "GET",
            userId: "seller-42",
            params: { token: String(issued.token) },
        });
        expect(response.status).toBe(502);

        const redirectHarness = await createHarness({ labelRedirect: true });
        await createShipment(redirectHarness, validShipmentBody());
        const redirectCapability = await jsonBody(
            await sourceRequest(redirectHarness, "issueLabelAccess", {
                method: "POST",
                userId: "seller-42",
                body: { externalOrderId: "order-1001", sellerCmsUserId: "seller-42" },
            }),
        );
        const redirectResponse = await sourceRequest(redirectHarness, "label", {
            method: "GET",
            userId: "seller-42",
            params: { token: String(redirectCapability.token) },
        });
        expect(redirectResponse.status).toBe(502);
    });
});

async function createHarness(
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

function requestFromFetchInput(input: RequestInfo | URL, init?: RequestInit): Request {
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

function observeFetchRequest(request: Request, url: URL, method: string, requestBody: string): ObservedFetchRequest {
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

async function relayPoints(
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

async function createShipment(
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

async function edgeCreateShipment(
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

async function edgeTracking(
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

async function sourceRequest(
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

async function tracking(
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

async function saveRelaySelection(
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

async function relaySelection(
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

async function setSettings(
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

async function loadEdgeHandler(): Promise<EdgeHandler> {
    if (!edgeHandler) {
        await import(edgeFunctionUrl);
    }
    if (!edgeHandler) {
        throw new Error("cms-delivery edge handler was not registered");
    }
    return edgeHandler;
}

function definition(): IntegrationDefinition {
    return JSON.parse(readFileSync(definitionUrl, "utf8")) as IntegrationDefinition;
}

function createShipmentField(createForm: JsonRecord | undefined, fieldId: string): JsonRecord | undefined {
    const sections = [...arrayValue(createForm?.main), ...arrayValue(createForm?.aside)];
    return sections
        .flatMap((section) => arrayValue((section as JsonRecord).fields))
        .find((field): field is JsonRecord => (field as JsonRecord).id === fieldId);
}

function arrayValue(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function integrationAnswers(): Record<string, string> {
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

function inProgressShipment(providerCallStartedAt: string): JsonRecord {
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

function validDeliveryQuoteRequest(externalOrderId: string): JsonRecord {
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

function defaultDeliveryQuoteRow(): JsonRecord {
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

function connectShipmentResponse(options: {
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

function trackingResponse(eventLabel = "Livré", statusCode = "82"): string {
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

function widgetRelayLookupResponse(): string {
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

function jsonResponse(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: { "content-type": "application/json; charset=utf-8" },
    });
}

function projectRows(url: URL, rows: JsonRecord[]): JsonRecord[] {
    const fields = selectedFields(url);
    if (!fields.length || fields.includes("*")) {
        return rows;
    }
    return rows.map((row) => projectRecord(row, fields));
}

function projectRecord(row: JsonRecord, fields: string[]): JsonRecord {
    return Object.fromEntries(fields.filter((field) => Object.hasOwn(row, field)).map((field) => [field, row[field]]));
}

function selectedFields(url: URL): string[] {
    return splitSelectFields(url.searchParams.get("select") ?? "");
}

function splitSelectFields(select: string): string[] {
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

function embeddedFields(fields: string[], prefix: string): string[] {
    const field = fields.find((candidate) => candidate.startsWith(`${prefix}!`) || candidate.startsWith(`${prefix}(`));
    if (!field) {
        return [];
    }
    const open = field.indexOf("(");
    return open < 0 ? [] : splitSelectFields(field.slice(open + 1, -1));
}

function stableJson(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(stableJson).join(",")}]`;
    }
    if (value && typeof value === "object") {
        const entries = Object.entries(value as JsonRecord).sort(([left], [right]) => left.localeCompare(right));
        return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}

function shipmentReservationError(
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

function sameTestAddress(actual: unknown, expected: unknown): boolean {
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

function nullableTimestampDescending(left: unknown, right: unknown): number {
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

function timestamp(value: unknown): number {
    const parsed = Date.parse(String(value ?? ""));
    return Number.isFinite(parsed) ? parsed : 0;
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
