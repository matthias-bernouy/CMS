import { describe, expect, test } from "bun:test";
import {
    importIntegration,
    InMemoryIntegrationInstallationRepository,
    type IntegrationBlocArtifact,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { executeFunction, InMemoryFunctionRepository, validateFunction } from "@bernouy/cms-functions";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryRolesRepository, USER_ROLE } from "@bernouy/cms-permissions";
import {
    InMemorySourceRepository,
    makeEndpointUrn,
    makeSourceUrn,
    type DataShape,
    type Source,
    type SourceEndpoint,
} from "@bernouy/cms-sources";

const string = (): DataShape => ({ type: "string" });
const number = (): DataShape => ({ type: "number" });
const boolean = (): DataShape => ({ type: "boolean" });
const object = (properties: Record<string, DataShape>): DataShape => ({ type: "object", properties });
const array = (properties: Record<string, DataShape>): DataShape => ({ type: "array", items: object(properties) });

describe("commerce-mondial-relay-fulfillment 1.0.0", () => {
    test("installs seller-only fulfillment, protected labels, and system reconciliation", async () => {
        const sources = await sourcesForFulfillment();
        const functions = new InMemoryFunctionRepository();
        const roles = new InMemoryRolesRepository();
        const installations = await installationsForFulfillment();
        const blocs: IntegrationBlocArtifact[] = [];
        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT)
            .get("commerce-mondial-relay-fulfillment");
        if (!definition) throw new Error("fulfillment definition not found");

        const result = await importIntegration({
            sources,
            functions,
            roles,
            installations,
            blocs: {
                async importBloc(artifact) {
                    blocs.push(artifact);
                    return { id: artifact.tag, action: "created" };
                },
            },
        }, { kind: definition.kind, answers: {}, options: {} }, [definition]);

        const ids = [
            "getShipmentForOrder",
            "getShipmentForMySale",
            "createShipmentForMySale",
            "requestShipmentLabelForMySale",
            "declareShipmentHandoffForMySale",
            "getClaimReturnForMe",
            "setRelayPointForMyClaimReturn",
            "getRelayPointForMyClaimReturn",
            "createClaimReturnShipmentForMyPurchase",
            "requestClaimReturnLabelForMyPurchase",
            "reconcileMondialRelayShipmentOperations",
            "reconcileMondialRelayFulfillments",
            "publishMondialRelayDeliveryHealth",
            "recoverMondialRelayShipmentCreation",
            "recordMondialRelayClaimReturnCarrierAcceptance",
            "recordMondialRelayClaimReturnRecipientHandoff",
            "cancelMondialRelayShipment",
        ];
        expect(result.artifacts.filter(item => item.type === "function").map(item => item.id)).toEqual(ids);
        expect(await functions.getFunction("createShipmentForPaidOrder")).toBeNull();
        for (const id of ids) {
            const fn = await functions.getFunction(id);
            expect(fn).toBeDefined();
            expect(await validateFunction(fn!, { sources })).toEqual([]);
        }

        const serialized = JSON.stringify(definition);
        expect(serialized).not.toContain("stripe-connect");
        expect(serialized).not.toContain("getPaymentByClientReference");
        expect(serialized).not.toContain("$steps.shipment.labelUrl");
        expect(serialized).toContain("reserveOrderShipmentCreation");
        expect(serialized).toContain("completeOrderShipmentCreation");
        expect(serialized).toContain("recordOrderFulfillment");
        expect(serialized).toContain("recipientHandoffAt");

        expect(blocs[0]?.viewJS).toContain("requestShipmentLabelForMySale");
        expect(blocs[0]?.viewJS).toContain("declareShipmentHandoffForMySale");
        expect(blocs[0]?.viewJS).not.toContain("shipment?.labelUrl");
        expect(blocs[0]?.viewJS).not.toContain("location.assign");
        expect(blocs[0]?.viewJS).toContain('document.createElement("a")');
        expect(blocs[0]?.viewJS).toContain("noopener noreferrer");
        expect(blocs[0]?.viewJS).toContain("dataset.shipmentStatus");
        expect(blocs[0]?.viewJS).toContain('"Dépôt déclaré"');
        expect(blocs[0]?.viewJS).toContain('"Retélécharger l’étiquette"');
        expect(blocs[0]?.viewJS).toContain('"J’ai déposé le colis"');
        expect(blocs[0]?.viewJS).toContain('new CustomEvent("commerce-fulfillment:updated"');
        expect(blocs[0]?.viewJS).not.toContain("content.dataset.status");
        const importedTemplate = atob(blocs[0]?.source?.["template.html"] ?? "");
        expect(importedTemplate).toContain("data-label");
        expect(importedTemplate).toContain("data-handoff");
        expect(importedTemplate).not.toContain('data-handoff type="button" appearance="outlined"');

        const grants = (await roles.get(USER_ROLE))?.grants.map(grant => grant.permission) ?? [];
        expect(grants).toEqual(expect.arrayContaining([
            "urn:system-functions:getShipmentForOrder",
            "urn:system-functions:getShipmentForMySale",
            "urn:system-functions:createShipmentForMySale",
            "urn:system-functions:requestShipmentLabelForMySale",
            "urn:system-functions:declareShipmentHandoffForMySale",
            "urn:system-functions:getClaimReturnForMe",
            "urn:system-functions:setRelayPointForMyClaimReturn",
            "urn:system-functions:getRelayPointForMyClaimReturn",
            "urn:system-functions:createClaimReturnShipmentForMyPurchase",
            "urn:system-functions:requestClaimReturnLabelForMyPurchase",
        ]));
        expect(grants).not.toContain("urn:system-functions:reconcileMondialRelayFulfillments");
    });

    test("creates one shipment only after Commerce authorization and records label creation", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "createShipmentForMySale");
        const calls: Array<{ url: string; body: unknown }> = [];

        const response = await executeFunction(fn, request("createShipmentForMySale", { orderId: "42" }), {
            sources,
            user: { id: "seller-subject", role: "user" },
            deps: {
                fetchImpl: async (input, init) => {
                    const req = new Request(input, init);
                    const url = new URL(req.url);
                    const body = req.method === "POST" ? await req.clone().json() : undefined;
                    calls.push({ url: req.url, body });
                    if (url.pathname === "/mySale") {
                        return Response.json({
                            id: 42, publicId: "order-public-42", orderNumber: "CO-42",
                            sellerId: "seller-subject", fulfillmentStatus: "awaiting_shipment",
                        });
                    }
                    if (url.pathname === "/fulfillment-authorization") {
                        return Response.json({
                            allowed: true,
                            reason: "",
                            orderId: 42,
                            orderPublicId: "order-public-42",
                            sellerId: "seller-subject",
                            buyerCmsUserId: "buyer-subject",
                            currency: "eur",
                            deliveryQuoteId: "quote-42",
                            merchandiseSubtotalMinorAmount: 11000,
                            shippingAmount: 450,
                            buyerTotalAmount: 11450,
                            financialTermsHash: "terms-42",
                            paymentStatus: "succeeded",
                            fulfillmentStatus: "awaiting_shipment",
                        });
                    }
                    if (url.pathname === "/reserveShipmentCreation") {
                        return Response.json({
                            operationId: 501,
                            claimToken: "00000000-0000-4000-8000-000000000501",
                            orderId: 42,
                            orderPublicId: "order-public-42",
                            sellerId: "seller-subject",
                            buyerCmsUserId: "buyer-subject",
                            currency: "eur",
                            deliveryQuoteId: "quote-42",
                            merchandiseSubtotalMinorAmount: 11000,
                            shippingAmount: 450,
                            buyerTotalAmount: 11450,
                            financialTermsHash: "terms-42",
                            paymentStatus: "succeeded",
                            fulfillmentStatus: "shipment_creating",
                        });
                    }
                    if (url.pathname === "/resolveDeliveryQuote") {
                        return Response.json({
                            quoteId: "quote-42", externalOrderId: "order-public-42", orderVersion: 1, revision: 1,
                            selectedForCmsUserId: "buyer-subject", relayLocation: "FR-024474", country: "FR",
                            number: "024474", name: "Relay", addressLine1: "3 Relay Street", addressLine2: "",
                            postalCode: "75002", city: "Paris", weightGrams: 500, shippingAmount: 450,
                            currency: "eur", merchandiseSubtotalMinorAmount: 11000,
                            quotedAt: "2026-07-12T09:00:00.000Z", expiresAt: "2026-07-12T09:15:00.000Z",
                            recipientSnapshot: {
                                name: "Alice Buyer", firstName: "Alice", lastName: "Buyer", email: "",
                                phone: "+33600000000", addressLine1: "1 rue du Test", addressLine2: "", addressLine3: "",
                                postalCode: "75001", city: "Paris", country: "FR",
                            },
                            sellerFulfillmentSnapshot: {
                                name: "Seller Test", firstName: "Seller", lastName: "Test", email: "",
                                phone: "+33611111111", addressLine1: "2 rue du Vendeur", addressLine2: "", addressLine3: "",
                                postalCode: "69001", city: "Lyon", country: "FR",
                            },
                        });
                    }
                    if (url.pathname === "/order") {
                        return Response.json({
                            id: 42,
                            publicId: "order-public-42",
                            shippingAddress: {
                                recipient: "Alice Buyer",
                                phone: "+33600000000",
                                addressLine1: "1 rue du Test",
                                addressLine2: "",
                                addressLine3: "",
                                postalCode: "75001",
                                city: "Paris",
                                countryCode: "FR",
                            },
                        });
                    }
                    if (url.pathname === "/relaySelection") {
                        return Response.json({ relayLocation: "FR-024474", weightGrams: 500 });
                    }
                    if (url.pathname === "/getAccountByUserId") {
                        return Response.json({
                            givenName: "Seller",
                            surname: "Test",
                            phone: "+33611111111",
                            addressLine1: "2 rue du Vendeur",
                            addressLine2: "",
                            addressLine3: "",
                            postalCode: "69001",
                            city: "Lyon",
                            countryCode: "FR",
                        });
                    }
                    if (url.pathname === "/createShipment") {
                        return Response.json({
                            ok: true,
                            id: "shipment-42",
                            expeditionNumber: "12345678",
                            trackingUrl: "https://www.mondialrelay.fr/suivi-de-colis?numeroExpedition=12345678",
                            status: "label_ready",
                            createdAt: "2026-07-13T09:00:00.000Z",
                        }, { status: 201 });
                    }
                    if (url.pathname === "/completeShipmentCreation") {
                        return Response.json({
                            orderId: 42,
                            orderPublicId: "order-public-42",
                            status: "label_created",
                            providerReference: "12345678",
                            version: 1,
                        });
                    }
                    throw new Error(`unexpected request: ${req.method} ${req.url}`);
                },
            },
        });

        expect(response.status).toBe(200);
        const shipmentCall = calls.find(call => new URL(call.url).pathname === "/createShipment");
        expect(shipmentCall?.body).toMatchObject({
            externalOrderId: "order-public-42",
            deliveryQuoteId: "quote-42",
            senderName: "Seller Test",
            recipientName: "Alice Buyer",
            deliveryRelayLocation: "FR-024474",
            packageCount: 1,
            declaredValueMinorAmount: 11000,
            declaredCurrency: "EUR",
            metadata: { commerceOrderId: "order-public-42", financialTermsHash: "terms-42", deliveryQuoteId: "quote-42", declaredValueMinorAmount: 11000, declaredCurrency: "EUR" },
        });
        const commerceCall = calls.find(call => new URL(call.url).pathname === "/completeShipmentCreation");
        expect(commerceCall?.body).toEqual({
            operationId: 501,
            claimToken: "00000000-0000-4000-8000-000000000501",
            providerReference: "12345678",
            providerShipmentId: "shipment-42",
            providerSnapshot: { status: "label_ready", createdAt: "2026-07-13T09:00:00.000Z" },
        });
        const body = await response.json();
        expect(JSON.stringify(body)).not.toContain("labelUrl");
        expect(calls.some(call => call.url.includes("stripe"))).toBe(false);
    });

    test("fails closed before Delivery when Commerce refuses fulfillment", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "createShipmentForMySale");
        let reachedDelivery = false;
        const response = await executeFunction(fn, request("createShipmentForMySale", { orderId: "42" }), {
            sources,
            user: { id: "seller-subject", role: "user" },
            deps: {
                fetchImpl: async (input, init) => {
                    const req = new Request(input, init);
                    const path = new URL(req.url).pathname;
                    if (path === "/mySale") {
                        return Response.json({ id: 42, publicId: "order-public-42", sellerId: "seller-subject" });
                    }
                    if (path === "/fulfillment-authorization") {
                        return Response.json({
                            allowed: false,
                            reason: "refund_pending",
                            orderId: 42,
                            orderPublicId: "order-public-42",
                            sellerId: "seller-subject",
                            buyerCmsUserId: "buyer-subject",
                            currency: "eur",
                            deliveryQuoteId: "quote-42",
                            merchandiseSubtotalMinorAmount: 11000,
                            paymentStatus: "succeeded",
                            fulfillmentStatus: "cancelled",
                        });
                    }
                    reachedDelivery = true;
                    return Response.json({});
                },
            },
        });
        expect(response.status).toBe(409);
        expect(reachedDelivery).toBe(false);
    });

    test("recovers a lost shipment-create response through the durable operation worker", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "reconcileMondialRelayShipmentOperations");
        const calls: Array<{ path: string; body: unknown }> = [];
        const response = await executeFunction(fn, request(fn.id, { runKey: "shipment-saga-recovery", limit: 5 }), {
            sources,
            user: { id: "system", role: "admin" },
            deps: {
                fetchImpl: async (input, init) => {
                    const req = new Request(input, init);
                    const path = new URL(req.url).pathname;
                    const body = req.method === "POST" ? await req.clone().json() : undefined;
                    calls.push({ path, body });
                    if (path === "/claimShipmentCreations") return Response.json({ items: [{
                        operationId: 501,
                        claimToken: "00000000-0000-4000-8000-000000000501",
                        orderPublicId: "order-public-42",
                        sellerId: "seller-subject",
                        buyerCmsUserId: "buyer-subject",
                        deliveryQuoteId: "quote-42",
                        merchandiseSubtotalMinorAmount: 11000,
                        currency: "EUR",
                        financialTermsHash: "terms-42",
                    }] });
                    if (path === "/resolveDeliveryQuote") return Response.json(fulfillmentQuote());
                    if (path === "/createShipment") return Response.json({
                        ok: true,
                        id: "shipment-42",
                        expeditionNumber: "12345678",
                        status: "label_ready",
                        trackingUrl: "https://www.mondialrelay.fr/suivi-de-colis?numeroExpedition=12345678",
                        createdAt: "2026-07-13T09:00:00.000Z",
                        idempotentReplay: true,
                    });
                    if (path === "/completeShipmentCreation") return Response.json({ status: "succeeded" });
                    if (path === "/claimShipmentCancellations") return Response.json({ items: [] });
                    throw new Error(`unexpected request: ${req.method} ${req.url}`);
                },
            },
        });

        expect(response.status).toBe(200);
        expect(calls.find(call => call.path === "/createShipment")?.body).toMatchObject({
            externalOrderId: "order-public-42",
            deliveryQuoteId: "quote-42",
            metadata: { financialTermsHash: "terms-42" },
        });
        expect(calls.find(call => call.path === "/completeShipmentCreation")?.body).toEqual({
            operationId: 501,
            claimToken: "00000000-0000-4000-8000-000000000501",
            providerReference: "12345678",
            providerShipmentId: "shipment-42",
            providerSnapshot: { status: "label_ready", createdAt: "2026-07-13T09:00:00.000Z" },
        });
    });

    test("confirms Delivery cancellation before Commerce can create the refund", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "reconcileMondialRelayShipmentOperations");
        const paths: string[] = [];
        const response = await executeFunction(fn, request(fn.id, { runKey: "shipment-cancel-recovery", limit: 5 }), {
            sources,
            user: { id: "system", role: "admin" },
            deps: {
                fetchImpl: async (input, init) => {
                    const req = new Request(input, init);
                    const path = new URL(req.url).pathname;
                    paths.push(path);
                    if (path === "/claimShipmentCreations") return Response.json({ items: [] });
                    if (path === "/claimShipmentCancellations") return Response.json({ items: [{
                        operationId: 601,
                        claimToken: "00000000-0000-4000-8000-000000000601",
                        orderPublicId: "order-public-42",
                        trackingUntil: "2026-07-15T09:00:00.000Z",
                    }] });
                    if (path === "/cancelShipmentReservation") return Response.json({
                        id: "shipment-42", externalOrderId: "order-public-42",
                        expeditionNumber: "12345678", status: "cancelled_unscanned",
                    });
                    if (path === "/completeShipmentCancellation") return Response.json({ status: "completed" });
                    throw new Error(`unexpected request: ${req.method} ${req.url}`);
                },
            },
        });

        expect(response.status).toBe(200);
        expect(paths.indexOf("/cancelShipmentReservation")).toBeLessThan(paths.indexOf("/completeShipmentCancellation"));
    });

    test("publishes global liveness separately from isolated order Delivery health", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "publishMondialRelayDeliveryHealth");
        const orderBodies: Array<Record<string, unknown>> = [];
        const response = await executeFunction(fn, request(fn.id, { runKey: "delivery-health-run", limit: 24 }), {
            sources,
            user: { id: "system", role: "admin" },
            deps: { fetchImpl: async (input, init) => {
                const req = new Request(input, init);
                const path = new URL(req.url).pathname;
                if (path === "/deliveryProjectionHealth") return Response.json({
                    checkedAt: "2026-07-13T09:30:00.000Z",
                    pendingProjectionCount: 0, manualReviewCount: 1, trackingErrorCount: 0,
                    orders: [
                        {
                            externalOrderId: "00000000-0000-4000-8000-00000000000a", shipmentId: "shipment-a",
                            providerReference: "11111111", shipmentStatus: "manual_review",
                            pendingProjectionCount: 0, manualReviewCount: 1, trackingErrorCount: 0,
                            trackingCheckedAt: "2026-07-13T09:29:00.000Z",
                        },
                        {
                            externalOrderId: "00000000-0000-4000-8000-00000000000b", shipmentId: "shipment-b",
                            providerReference: "22222222", shipmentStatus: "collected_by_recipient",
                            pendingProjectionCount: 0, manualReviewCount: 0, trackingErrorCount: 0,
                            trackingCheckedAt: "2026-07-13T09:29:30.000Z",
                        },
                    ],
                });
                if (path === "/recordDeliveryReconciliationHealth") {
                    return Response.json(await req.json());
                }
                if (path === "/recordDeliveryOrderReconciliationHealth") {
                    const body = await req.json() as Record<string, unknown>;
                    orderBodies.push(body);
                    return Response.json(body);
                }
                throw new Error(`unexpected health call: ${req.url}`);
            } },
        });
        expect(response.status).toBe(200);
        expect(orderBodies).toHaveLength(2);
        expect(orderBodies).toEqual(expect.arrayContaining([
            expect.objectContaining({ orderPublicId: "00000000-0000-4000-8000-00000000000a", manualReviewCount: 1 }),
            expect.objectContaining({ orderPublicId: "00000000-0000-4000-8000-00000000000b", manualReviewCount: 0 }),
        ]));
    });

    test("completes Commerce immediately after an audited Delivery unknown-shipment recovery", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "recoverMondialRelayShipmentCreation");
        const paths: string[] = [];
        let commerceBody: unknown;
        const response = await executeFunction(fn, request(fn.id, {
            shipmentId: "shipment-unknown-42", orderPublicId: "order-public-42",
            expeditionNumber: "12345678", labelUrl: "https://connect-api-sandbox.mondialrelay.com/label.pdf",
            reason: "Verified against the provider back office",
        }), {
            sources,
            user: { id: "cms-administrator", role: "admin" },
            deps: { fetchImpl: async (input, init) => {
                const req = new Request(input, init);
                const path = new URL(req.url).pathname;
                paths.push(path);
                if (path === "/recoverUnknownShipment") return Response.json({
                    id: "shipment-unknown-42", externalOrderId: "order-public-42",
                    expeditionNumber: "12345678", status: "created",
                });
                if (path === "/recoverOrderShipmentCreation") {
                    commerceBody = await req.json();
                    return Response.json({ status: "succeeded", providerReference: "12345678" });
                }
                throw new Error(`unexpected recovery call: ${req.url}`);
            } },
        });
        expect(response.status).toBe(200);
        expect(paths).toEqual(["/recoverUnknownShipment", "/recoverOrderShipmentCreation"]);
        expect(commerceBody).toMatchObject({
            orderPublicId: "order-public-42", providerReference: "12345678",
            providerShipmentId: "shipment-unknown-42",
            reason: "Verified against the provider back office",
        });
    });

    test("enforces shipment recovery as exact admin-only before mutation", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "recoverMondialRelayShipmentCreation");
        expect(fn.access).toEqual({ mode: "admin" });

        let calls = 0;
        const response = await executeFunction(fn, request(fn.id, {
            shipmentId: "shipment-unknown-42", orderPublicId: "order-public-42",
            expeditionNumber: "12345678", reason: "Verified against the provider back office",
        }), {
            sources,
            user: { id: "custom-operator", role: "custom" },
            deps: { fetchImpl: async () => {
                calls++;
                return Response.json({});
            } },
        });

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({
            error: "Shipment recovery requires an admin",
        });
        expect(calls).toBe(0);
    });

    test("forwards normalized reconciliation events to Commerce without browser identity", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "reconcileMondialRelayFulfillments");
        const recorded: unknown[] = [];
        const acknowledged: unknown[] = [];
        const reconciliationRequests: unknown[] = [];
        const response = await executeFunction(fn, request("reconcileMondialRelayFulfillments", {
            runKey: "fulfillment-worker-1",
            limit: 25,
        }), {
            sources,
            user: { id: "system", role: "admin" },
            deps: {
                fetchImpl: async (input, init) => {
                    const req = new Request(input, init);
                    const path = new URL(req.url).pathname;
                    const health = await reconciliationHealthResponse(req);
                    if (health) return health;
                    if (path === "/reconcileShipments") {
                        reconciliationRequests.push(await req.json());
                        return Response.json({
                            processed: 1,
                            shipments: [{ id: "shipment-42", status: "collected_by_recipient" }],
                            events: [{
                                eventId: 101,
                                claimToken: "00000000-0000-4000-8000-000000000101",
                                projectionAttempts: 1,
                                orderPublicId: "order-public-42",
                                providerEventId: "mondial-relay|12345678|2026-07-13|11:30|recipient",
                                normalizedStatus: "collected_by_recipient",
                                occurredAt: "2026-07-13T09:30:00.000Z",
                                providerReference: "12345678",
                                recipientHandoffAt: "2026-07-13T09:30:00.000Z",
                            }],
                            claimReturnEvents: [],
                        });
                    }
                    if (path === "/recordOrderFulfillment") {
                        recorded.push(await req.json());
                        return Response.json({
                            orderId: 42,
                            orderPublicId: "order-public-42",
                            status: "collected_by_recipient",
                            providerReference: "12345678",
                            recipientHandoffAt: "2026-07-13T09:30:00.000Z",
                            claimByAt: "2026-07-15T09:30:00.000Z",
                            releaseEligibleAt: "2026-07-15T09:30:00.000Z",
                            version: 3,
                        });
                    }
                    if (path === "/acknowledgeShipmentEvent") {
                        acknowledged.push(await req.json());
                        return Response.json({ acknowledged: true });
                    }
                    throw new Error(`unexpected request: ${req.url}`);
                },
            },
        });
        expect(response.status).toBe(200);
        expect(reconciliationRequests).toEqual([{ runKey: "fulfillment-worker-1", limit: 8 }]);
        expect(recorded).toEqual([{
            orderPublicId: "order-public-42",
            providerEventId: "mondial-relay|12345678|2026-07-13|11:30|recipient",
            normalizedStatus: "collected_by_recipient",
            occurredAt: "2026-07-13T09:30:00.000Z",
            providerReference: "12345678",
            recipientHandoffAt: "2026-07-13T09:30:00.000Z",
        }]);
        expect(acknowledged).toEqual([{
            eventId: 101,
            claimToken: "00000000-0000-4000-8000-000000000101",
        }]);
    });

    test("leaves a Delivery event pending when Commerce projection fails", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "reconcileMondialRelayFulfillments");
        let acknowledged = false;
        const response = await executeFunction(fn, request("reconcileMondialRelayFulfillments", {
            runKey: "fulfillment-worker-2",
            limit: 1,
        }), {
            sources,
            user: { id: "system", role: "admin" },
            deps: {
                fetchImpl: async (input, init) => {
                    const req = new Request(input, init);
                    const path = new URL(req.url).pathname;
                    const health = await reconciliationHealthResponse(req);
                    if (health) return health;
                    if (path === "/reconcileShipments") {
                        return Response.json({
                            processed: 0,
                            shipments: [],
                            events: [{
                                eventId: 102,
                                claimToken: "00000000-0000-4000-8000-000000000102",
                                projectionAttempts: 1,
                                orderPublicId: "order-public-42",
                                providerEventId: "mondial-relay|12345678|lost",
                                normalizedStatus: "lost",
                                occurredAt: "2026-07-13T09:30:00.000Z",
                                providerReference: "12345678",
                            }],
                            claimReturnEvents: [],
                        });
                    }
                    if (path === "/recordOrderFulfillment") {
                        return Response.json({ error: "temporarily unavailable" }, { status: 503 });
                    }
                    if (path === "/acknowledgeShipmentEvent") acknowledged = true;
                    if (path === "/failShipmentEventProjection") {
                        return Response.json({
                            id: 102, projectionStatus: "retry_wait", projectionAttempts: 1,
                            projectionNextAttemptAt: "2026-07-13T09:31:00.000Z",
                            projectionLastError: "Commerce order fulfillment projection failed",
                        });
                    }
                    return Response.json({ acknowledged: true });
                },
            },
        });

        expect(response.status).toBe(200);
        expect(acknowledged).toBe(false);
    });

    test("drains and acknowledges a full eight-event Delivery projection batch", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "reconcileMondialRelayFulfillments");
        const recorded: number[] = [];
        const acknowledged: number[] = [];
        const response = await executeFunction(fn, request(fn.id, { runKey: "full-delivery-batch", limit: 8 }), {
            sources,
            user: { id: "system", role: "admin" },
            deps: { fetchImpl: async (input, init) => {
                const req = new Request(input, init);
                const path = new URL(req.url).pathname;
                if (path === "/reconcileShipments") {
                    return Response.json({
                        processed: 8, shipments: [], claimReturnEvents: [],
                        events: Array.from({ length: 8 }, (_, index) => ({
                            eventId: 300 + index, claimToken: `claim-${300 + index}`, projectionAttempts: 1,
                            orderPublicId: `order-${300 + index}`, providerEventId: `provider-${300 + index}`,
                            normalizedStatus: "in_transit", occurredAt: `2026-07-13T09:${String(index).padStart(2, "0")}:00.000Z`,
                            providerReference: `expedition-${300 + index}`,
                        })),
                    });
                }
                if (path === "/recordOrderFulfillment") {
                    const body = await req.json() as Record<string, unknown>;
                    recorded.push(Number(String(body.providerEventId).replace("provider-", "")));
                    return Response.json({ orderPublicId: body.orderPublicId, status: "in_transit" });
                }
                if (path === "/acknowledgeShipmentEvent") {
                    const body = await req.json() as Record<string, unknown>;
                    acknowledged.push(Number(body.eventId));
                    return Response.json({ acknowledged: true });
                }
                throw new Error(`unexpected full-batch call: ${req.url}`);
            } },
        });

        expect(response.status).toBe(200);
        expect(recorded).toHaveLength(8);
        expect(acknowledged).toEqual(Array.from({ length: 8 }, (_, index) => 300 + index));
    });

    test("continues after a poison event and acknowledges only the following successful event", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "reconcileMondialRelayFulfillments");
        const recorded: string[] = [];
        const acknowledged: number[] = [];
        const failed: number[] = [];
        const response = await executeFunction(fn, request("reconcileMondialRelayFulfillments", {
            runKey: "poison-worker", limit: 8,
        }), {
            sources,
            user: { id: "system", role: "admin" },
            deps: {
                fetchImpl: async (input, init) => {
                    const req = new Request(input, init);
                    const path = new URL(req.url).pathname;
                    const health = await reconciliationHealthResponse(req);
                    if (health) return health;
                    if (path === "/reconcileShipments") {
                        return Response.json({
                            processed: 0, shipments: [], claimReturnEvents: [],
                            events: [201, 202].map(id => ({
                                eventId: id, claimToken: `token-${id}`, projectionAttempts: 1,
                                orderPublicId: `order-${id}`, providerEventId: `provider-${id}`,
                                normalizedStatus: "carrier_accepted", occurredAt: "2026-07-13T09:30:00.000Z",
                                providerReference: `expedition-${id}`, carrierAcceptedAt: "2026-07-13T09:30:00.000Z",
                            })),
                        });
                    }
                    if (path === "/recordOrderFulfillment") {
                        const body = await req.json() as Record<string, unknown>;
                        recorded.push(String(body.providerEventId));
                        return Response.json({
                            orderId: Number(String(body.orderPublicId).replace("order-", "")),
                            orderPublicId: body.orderPublicId, status: "carrier_accepted",
                            providerReference: body.providerReference, version: 2,
                        });
                    }
                    if (path === "/acknowledgeShipmentEvent") {
                        const body = await req.json() as Record<string, unknown>;
                        acknowledged.push(Number(body.eventId));
                        if (body.eventId === 201) return Response.json({ error: "temporary ack failure" }, { status: 503 });
                        return Response.json({ acknowledged: true });
                    }
                    if (path === "/failShipmentEventProjection") {
                        const body = await req.json() as Record<string, unknown>;
                        failed.push(Number(body.eventId));
                        return Response.json({
                            id: body.eventId, projectionStatus: "retry_wait", projectionAttempts: 1,
                            projectionNextAttemptAt: "2026-07-13T09:31:00.000Z",
                            projectionLastError: body.error,
                        });
                    }
                    throw new Error(`unexpected request: ${req.url}`);
                },
            },
        });

        expect(response.status).toBe(200);
        expect(recorded).toEqual(["provider-201", "provider-202"]);
        expect(acknowledged).toEqual([201, 202]);
        expect(failed).toEqual([201]);
        expect(await response.json()).toMatchObject({
            events: [
                { eventId: 201, providerEventId: "provider-201", projectionFailed: true },
                { orderPublicId: "order-202", status: "carrier_accepted" },
            ],
        });
    });

    test("creates an idempotent claim return from trusted buyer, seller, and relay snapshots", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "createClaimReturnShipmentForMyPurchase");
        const calls: Array<{ path: string; body: unknown }> = [];
        const response = await executeFunction(fn, request("createClaimReturnShipmentForMyPurchase", { claimId: 7 }), {
            sources,
            user: { id: "buyer-subject", role: "user" },
            deps: {
                fetchImpl: async (input, init) => {
                    const req = new Request(input, init);
                    const path = new URL(req.url).pathname;
                    calls.push({ path, body: req.method === "POST" ? await req.clone().json() : undefined });
                    if (path === "/claim-return-authorization") {
                        return Response.json({
                            allowed: true, reason: "authorized", claimId: 7, claimPublicId: "claim-7",
                            claimStatus: "return_required", claimVersion: 2,
                            returnShipByAt: "2026-07-20T09:00:00.000Z", returnDeliveryStatus: "awaiting_carrier",
                            orderId: 42, orderPublicId: "order-public-42", orderNumber: "CO-42",
                            buyerCmsUserId: "buyer-subject", sellerId: 12, sellerCmsUserId: "seller-subject",
                            deliveryQuoteId: "quote-42", merchandiseSubtotalMinorAmount: 11000, currency: "eur",
                        });
                    }
                    if (path === "/resolveDeliveryQuote") {
                        return Response.json({
                            quoteId: "quote-42", externalOrderId: "order-public-42", orderVersion: 1, revision: 1,
                            selectedForCmsUserId: "buyer-subject", relayLocation: "FR-031270", country: "FR",
                            number: "031270", name: "Original relay", addressLine1: "3 Relay Street", addressLine2: "",
                            postalCode: "75002", city: "Paris", weightGrams: 500, shippingAmount: 450,
                            currency: "eur", merchandiseSubtotalMinorAmount: 11000,
                            quotedAt: "2026-07-01T09:00:00.000Z", expiresAt: "2026-07-01T09:15:00.000Z",
                            recipientSnapshot: {
                                name: "Buyer Name", firstName: "Buyer", lastName: "Name", email: "",
                                phone: "+33600000000", addressLine1: "1 Buyer Street", addressLine2: "", addressLine3: "",
                                postalCode: "75001", city: "Paris", country: "FR",
                            },
                            sellerFulfillmentSnapshot: {
                                name: "Seller Name", firstName: "Seller", lastName: "Name", email: "",
                                phone: "+33611111111", addressLine1: "2 Seller Street", addressLine2: "", addressLine3: "",
                                postalCode: "69001", city: "Lyon", country: "FR",
                            },
                        });
                    }
                    if (path === "/order") {
                        return Response.json({
                            id: 42, publicId: "order-public-42",
                            shippingAddress: {
                                recipient: "Buyer Name", givenName: "Buyer", surname: "Name", phone: "+33600000000",
                                addressLine1: "1 Buyer Street", addressLine2: "", addressLine3: "",
                                postalCode: "75001", city: "Paris", countryCode: "FR",
                            },
                        });
                    }
                    if (path === "/getAccountByUserId") {
                        expect(new URL(req.url).searchParams.get("userId")).toBe("seller-subject");
                        return Response.json({
                            givenName: "Seller", surname: "Name", phone: "+33611111111",
                            addressLine1: "2 Seller Street", addressLine2: "", addressLine3: "",
                            postalCode: "69001", city: "Lyon", countryCode: "FR",
                        });
                    }
                    if (path === "/relaySelection") {
                        expect(new URL(req.url).searchParams.get("externalOrderId")).toBe("claim-return:7");
                        return Response.json({ relayLocation: "FR-024474", weightGrams: 500 });
                    }
                    if (path === "/createShipment") {
                        return Response.json({
                            ok: true, id: "return-shipment-7", expeditionNumber: "87654321",
                            trackingUrl: "https://www.mondialrelay.fr/suivi-de-colis?numeroExpedition=87654321",
                            status: "label_ready", createdAt: "2026-07-13T09:00:00.000Z", idempotentReplay: true,
                        });
                    }
                    throw new Error(`unexpected request: ${req.method} ${req.url}`);
                },
            },
        });

        expect(response.status).toBe(200);
        expect(calls.find(call => call.path === "/createShipment")?.body).toMatchObject({
            externalOrderId: "claim-return:7",
            deliveryQuoteId: "quote-42",
            senderName: "Buyer Name",
            senderAddressLine1: "1 Buyer Street",
            recipientName: "Seller Name",
            recipientAddressLine1: "2 Seller Street",
            deliveryRelayLocation: "FR-024474",
            declaredValueMinorAmount: 11000,
            metadata: { commerceClaimId: 7, commerceOrderId: "order-public-42", shipmentKind: "claim_return", deliveryQuoteId: "quote-42", declaredValueMinorAmount: 11000, declaredCurrency: "EUR" },
        });
        const body = await response.json();
        expect(body.shipment.idempotentReplay).toBe(true);
        expect(JSON.stringify(body)).not.toContain("labelUrl");
        expect(JSON.stringify(body)).not.toContain("Seller Street");
    });

    test("fails before Delivery when a non-buyer requests a claim return label", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "requestClaimReturnLabelForMyPurchase");
        let reachedDelivery = false;
        const response = await executeFunction(fn, request("requestClaimReturnLabelForMyPurchase", { claimId: 7 }), {
            sources,
            user: { id: "unrelated-user", role: "user" },
            deps: {
                fetchImpl: async (input, init) => {
                    const req = new Request(input, init);
                    if (new URL(req.url).pathname === "/claim-return-authorization") {
                        return Response.json({
                            allowed: true, reason: "authorized", claimId: 7, claimPublicId: "claim-7",
                            claimStatus: "return_required", claimVersion: 2,
                            returnShipByAt: "2026-07-20T09:00:00.000Z", returnDeliveryStatus: "awaiting_carrier",
                            orderId: 42, orderPublicId: "order-public-42", orderNumber: "CO-42",
                            buyerCmsUserId: "buyer-subject", sellerId: 12, sellerCmsUserId: "seller-subject",
                        });
                    }
                    reachedDelivery = true;
                    return Response.json({});
                },
            },
        });
        expect(response.status).toBe(403);
        expect(reachedDelivery).toBe(false);
    });

    test("does not create a return when Commerce revokes authorization during preparation", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "createClaimReturnShipmentForMyPurchase");
        let authorizationCalls = 0;
        let shipmentCreated = false;
        const response = await executeFunction(fn, request("createClaimReturnShipmentForMyPurchase", { claimId: 7 }), {
            sources,
            user: { id: "buyer-subject", role: "user" },
            deps: {
                fetchImpl: async (input, init) => {
                    const req = new Request(input, init);
                    const path = new URL(req.url).pathname;
                    if (path === "/claim-return-authorization") {
                        authorizationCalls += 1;
                        return Response.json({
                            allowed: authorizationCalls === 1,
                            reason: authorizationCalls === 1 ? "authorized" : "return_ship_deadline_passed",
                            claimId: 7, claimPublicId: "claim-7", claimStatus: authorizationCalls === 1 ? "return_required" : "under_review",
                            claimVersion: authorizationCalls === 1 ? 2 : 3,
                            returnShipByAt: "2026-07-13T09:00:00.000Z", returnDeliveryStatus: "awaiting_carrier",
                            orderId: 42, orderPublicId: "order-public-42", orderNumber: "CO-42",
                            buyerCmsUserId: "buyer-subject", sellerId: 12, sellerCmsUserId: "seller-subject",
                        });
                    }
                    if (path === "/order") {
                        return Response.json({
                            id: 42, publicId: "order-public-42",
                            shippingAddress: {
                                recipient: "Buyer Name", givenName: "Buyer", surname: "Name", phone: "+33600000000",
                                addressLine1: "1 Buyer Street", addressLine2: "", addressLine3: "",
                                postalCode: "75001", city: "Paris", countryCode: "FR",
                            },
                        });
                    }
                    if (path === "/getAccountByUserId") {
                        return Response.json({
                            givenName: "Seller", surname: "Name", phone: "+33611111111",
                            addressLine1: "2 Seller Street", addressLine2: "", addressLine3: "",
                            postalCode: "69001", city: "Lyon", countryCode: "FR",
                        });
                    }
                    if (path === "/relaySelection") return Response.json({ relayLocation: "FR-024474", weightGrams: 500 });
                    if (path === "/createShipment") shipmentCreated = true;
                    return Response.json({});
                },
            },
        });
        expect(response.status).toBe(409);
        expect(authorizationCalls).toBe(2);
        expect(shipmentCreated).toBe(false);
    });

    test("projects and acknowledges claim return carrier events through the worker", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "reconcileMondialRelayFulfillments");
        const recorded: unknown[] = [];
        const acknowledged: unknown[] = [];
        const response = await executeFunction(fn, request("reconcileMondialRelayFulfillments", {
            runKey: "claim-return-worker", limit: 24,
        }), {
            sources,
            user: { id: "system", role: "admin" },
            deps: {
                fetchImpl: async (input, init) => {
                    const req = new Request(input, init);
                    const path = new URL(req.url).pathname;
                    const health = await reconciliationHealthResponse(req);
                    if (health) return health;
                    if (path === "/reconcileShipments") {
                        return Response.json({
                            processed: 1, shipments: [{ id: "return-shipment-7", status: "carrier_accepted" }], events: [],
                            claimReturnEvents: [{
                                eventId: 107, claimToken: "00000000-0000-4000-8000-000000000107", projectionAttempts: 1,
                                claimId: 7, externalOrderId: "claim-return:7", providerEventId: "provider-event-7",
                                normalizedStatus: "carrier_accepted", occurredAt: "2026-07-13T09:00:00.000Z",
                                providerReference: "87654321",
                                providerEvidence: { provider: "mondial-relay", providerStatus: "carrier_accepted" },
                            }],
                        });
                    }
                    if (path === "/recordClaimReturnDelivery") {
                        recorded.push(await req.json());
                        return Response.json({ id: 7, status: "return_required", returnDeliveryStatus: "carrier_accepted" });
                    }
                    if (path === "/acknowledgeShipmentEvent") {
                        acknowledged.push(await req.json());
                        return Response.json({ acknowledged: true });
                    }
                    throw new Error(`unexpected request: ${req.url}`);
                },
            },
        });
        expect(response.status).toBe(200);
        expect(recorded).toEqual([{
            claimId: 7, providerEventId: "provider-event-7", providerReference: "87654321",
            normalizedStatus: "carrier_accepted", occurredAt: "2026-07-13T09:00:00.000Z",
            providerEvidence: { provider: "mondial-relay", providerStatus: "carrier_accepted" },
        }]);
        expect(acknowledged).toEqual([{
            eventId: 107, claimToken: "00000000-0000-4000-8000-000000000107",
        }]);
    });

    test("records claim return handoff only from a claim-bound provider shipment", async () => {
        const { sources, functions } = await installedFunctions();
        const fn = await requiredFunction(functions, "recordMondialRelayClaimReturnRecipientHandoff");
        let recorded: unknown;
        const response = await executeFunction(fn, request("recordMondialRelayClaimReturnRecipientHandoff", {
            claimId: 7,
            expeditionNumber: "87654321",
        }), {
            sources,
            user: { id: "system", role: "admin" },
            deps: {
                fetchImpl: async (input, init) => {
                    const req = new Request(input, init);
                    const path = new URL(req.url).pathname;
                    if (path === "/shipment") {
                        expect(new URL(req.url).searchParams.get("expeditionNumber")).toBe("87654321");
                        return Response.json({
                            id: "return-shipment-7",
                            externalOrderId: "claim-return:7",
                            expeditionNumber: "87654321",
                            status: "collected_by_recipient",
                            recipientHandoffAt: "2026-07-13T14:30:00.000Z",
                        });
                    }
                    if (path === "/tracking") {
                        return Response.json({
                            expeditionNumber: "87654321",
                            status: "collected_by_recipient",
                            carrierAcceptedAt: "2026-07-12T09:00:00.000Z",
                            recipientHandoffAt: "2026-07-13T14:30:00.000Z",
                            events: [],
                        });
                    }
                    if (path === "/recordClaimReturnDelivery") {
                        recorded = await req.json();
                        return Response.json({ id: 7, status: "return_required", returnDeliveryStatus: "recipient_handoff" });
                    }
                    throw new Error(`unexpected request: ${req.url}`);
                },
            },
        });

        expect(response.status).toBe(200);
        expect(recorded).toEqual({
            claimId: 7,
            providerEventId: "mondial-relay-return|87654321|recipient_handoff|2026-07-13T14:30:00.000Z",
            providerReference: "87654321",
            normalizedStatus: "recipient_handoff",
            occurredAt: "2026-07-13T14:30:00.000Z",
            providerEvidence: {
                provider: "mondial-relay",
                shipmentId: "return-shipment-7",
                providerStatus: "collected_by_recipient",
            },
        });
    });
});

async function installedFunctions() {
    const sources = await sourcesForFulfillment();
    const functions = new InMemoryFunctionRepository();
    const installations = await installationsForFulfillment();
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT)
        .get("commerce-mondial-relay-fulfillment");
    if (!definition) throw new Error("fulfillment definition not found");
    await importIntegration({
        sources,
        functions,
        installations,
        roles: new InMemoryRolesRepository(),
        blocs: { async importBloc(artifact) { return { id: artifact.tag, action: "created" }; } },
    }, { kind: definition.kind, answers: {}, options: {} }, [definition]);
    return { sources, functions };
}

async function sourcesForFulfillment(): Promise<InMemorySourceRepository> {
    const repository = new InMemorySourceRepository();
    const commerce = makeSource("commerce", [
        endpoint("myOrder", "GET", "/myOrder", object({
            id: number(), publicId: string(), buyerCmsUserId: string(),
        }), { id: string() }, undefined, "auth"),
        endpoint("mySale", "GET", "/mySale", object({
            id: number(), publicId: string(), orderNumber: string(),
            sellerId: { type: "string", semantic: "user-id" }, fulfillmentStatus: string(),
        }), { id: string() }, undefined, "auth"),
        endpoint("order", "GET", "/order", object({
            id: number(), publicId: string(), shippingAddress: object({
                recipient: string(), givenName: string(), surname: string(), phone: string(),
                addressLine1: string(), addressLine2: string(),
                addressLine3: string(), postalCode: string(), city: string(), countryCode: string(),
            }),
        }), { id: string() }),
        endpoint("getOrderFulfillmentAuthorization", "GET", "/fulfillment-authorization", object({
            allowed: boolean(), reason: string(), orderId: number(), orderPublicId: string(),
            sellerId: { type: "string", semantic: "user-id" }, buyerCmsUserId: string(),
            currency: string(), deliveryQuoteId: string(), merchandiseSubtotalMinorAmount: number(),
            shippingAmount: number(), buyerTotalAmount: number(), financialTermsHash: string(),
            paymentStatus: string(), fulfillmentStatus: string(),
        }), { orderPublicId: string() }, undefined, "system"),
        endpoint("reserveOrderShipmentCreation", "POST", "/reserveShipmentCreation", object({
            operationId: number(), claimToken: string(), orderId: number(), orderPublicId: string(),
            sellerId: { type: "string", semantic: "user-id" }, buyerCmsUserId: string(),
            currency: string(), deliveryQuoteId: string(), merchandiseSubtotalMinorAmount: number(),
            shippingAmount: number(), buyerTotalAmount: number(), financialTermsHash: string(),
            paymentStatus: string(), fulfillmentStatus: string(),
        }), undefined, { orderPublicId: string(), workerId: string() }, "system", ["200", "409"]),
        endpoint("getOrderLabelAuthorization", "GET", "/label-authorization", object({
            allowed: boolean(), reason: string(), orderId: number(), orderPublicId: string(),
            sellerId: { type: "string", semantic: "user-id" },
            sellerCmsUserId: { type: "string", semantic: "user-id" }, providerReference: string(),
        }), { orderPublicId: string() }, undefined, "system"),
        endpoint("completeOrderShipmentCreation", "POST", "/completeShipmentCreation", object({
            orderId: number(), orderPublicId: string(), status: string(), providerReference: string(), version: number(),
        }), undefined, {
            operationId: number(), claimToken: string(), providerReference: string(), providerShipmentId: string(),
            providerSnapshot: object({ status: string(), createdAt: string() }),
        }, "system"),
        endpoint("claimPendingShipmentCreations", "POST", "/claimShipmentCreations", object({
            items: array({
                operationId: number(), claimToken: string(), orderPublicId: string(),
                sellerId: { type: "string", semantic: "user-id" }, buyerCmsUserId: string(),
                deliveryQuoteId: string(), merchandiseSubtotalMinorAmount: number(), currency: string(),
                financialTermsHash: string(),
            }),
        }), undefined, { runKey: string(), limit: number() }, "system"),
        endpoint("failOrderShipmentCreation", "POST", "/failShipmentCreation", object({
            operationId: number(), status: string(),
        }), undefined, { operationId: number(), claimToken: string(), error: string() }, "system"),
        endpoint("claimPendingShipmentCancellations", "POST", "/claimShipmentCancellations", object({
            items: array({ operationId: number(), claimToken: string(), orderPublicId: string(), trackingUntil: string() }),
        }), undefined, { runKey: string(), limit: number() }, "system"),
        endpoint("completeOrderShipmentCancellation", "POST", "/completeShipmentCancellation", object({
            operationId: number(), status: string(),
        }), undefined, {
            operationId: number(), claimToken: string(), providerStatus: string(), providerReference: string(),
            providerSnapshot: object({
                id: string(), externalOrderId: string(), expeditionNumber: string(), status: string(),
            }),
        }, "system"),
        endpoint("failOrderShipmentCancellation", "POST", "/failShipmentCancellation", object({
            operationId: number(), status: string(),
        }), undefined, { operationId: number(), claimToken: string(), error: string() }, "system"),
        endpoint("recordDeliveryReconciliationHealth", "POST", "/recordDeliveryReconciliationHealth", object({
            runKey: string(), checkedAt: string(), pendingProjectionCount: number(), manualReviewCount: number(),
            trackingErrorCount: number(),
        }), undefined, {
            runKey: string(), checkedAt: string(), pendingProjectionCount: number(), manualReviewCount: number(),
            trackingErrorCount: number(),
        }, "system"),
        endpoint("recordDeliveryOrderReconciliationHealth", "POST", "/recordDeliveryOrderReconciliationHealth", object({
            orderPublicId: string(), checkedAt: string(), pendingProjectionCount: number(),
            manualReviewCount: number(), trackingErrorCount: number(),
        }), undefined, {
            runKey: string(), checkedAt: string(), orderPublicId: string(), shipmentId: string(),
            providerReference: string(), shipmentStatus: string(), pendingProjectionCount: number(),
            manualReviewCount: number(), trackingErrorCount: number(), trackingCheckedAt: string(),
        }, "system"),
        endpoint("recoverOrderShipmentCreation", "POST", "/recoverOrderShipmentCreation", object({
            status: string(), providerReference: string(),
        }), undefined, {
            orderPublicId: string(), providerReference: string(), providerShipmentId: string(),
            reason: string(), providerSnapshot: object({
                id: string(), externalOrderId: string(), expeditionNumber: string(), status: string(),
            }),
        }, "admin"),
        endpoint("getClaimReturnAuthorization", "GET", "/claim-return-authorization", object({
            allowed: boolean(), reason: string(), claimId: number(), claimPublicId: string(),
            claimStatus: string(), claimVersion: number(), returnShipByAt: string(), returnDeliveryStatus: string(),
            orderId: number(), orderPublicId: string(), orderNumber: string(),
            buyerCmsUserId: { type: "string", semantic: "user-id" }, sellerId: number(),
            sellerCmsUserId: { type: "string", semantic: "user-id" },
            deliveryQuoteId: string(), merchandiseSubtotalMinorAmount: number(), currency: string(),
        }), { claimId: number() }, undefined, "system"),
        endpoint("recordOrderFulfillment", "POST", "/recordOrderFulfillment", object({
            orderId: number(), orderPublicId: string(), status: string(), providerReference: string(),
            carrierAcceptedAt: string(), sellerHandoffDeclaredAt: string(), recipientHandoffAt: string(),
            claimByAt: string(), releaseEligibleAt: string(), blockingReason: string(), version: number(),
        }), undefined, {
            orderPublicId: string(), providerEventId: string(), normalizedStatus: string(), occurredAt: string(),
            providerReference: string(), recipientHandoffAt: string(), carrierAcceptedAt: string(),
            sellerHandoffDeclaredAt: string(),
        }, "system"),
        endpoint("recordClaimReturnDelivery", "POST", "/recordClaimReturnDelivery", object({
            id: number(), status: string(), returnDeliveryStatus: string(),
        }), undefined, {
            claimId: number(), providerEventId: string(), providerReference: string(),
            normalizedStatus: string(), occurredAt: string(), providerEvidence: object({
                provider: string(), shipmentId: string(), providerStatus: string(),
            }),
        }, "system"),
    ]);
    const delivery = makeSource("delivery", [
        endpoint("resolveDeliveryQuote", "POST", "/resolveDeliveryQuote", object({
            quoteId: string(), externalOrderId: string(), orderVersion: number(), revision: number(),
            selectedForCmsUserId: { type: "string", semantic: "user-id" }, relayLocation: string(),
            country: string(), number: string(), name: string(), addressLine1: string(), addressLine2: string(),
            postalCode: string(), city: string(), weightGrams: number(), shippingAmount: number(), currency: string(),
            merchandiseSubtotalMinorAmount: number(), quotedAt: string(), expiresAt: string(),
            recipientSnapshot: fulfillmentAddressShape(), sellerFulfillmentSnapshot: fulfillmentAddressShape(),
        }), undefined, {
            quoteId: string(), externalOrderId: string(), selectedForCmsUserId: { type: "string", semantic: "user-id" },
            orderVersion: number(), merchandiseSubtotalMinorAmount: number(), currency: string(), purpose: string(),
        }, "system"),
        endpoint("relaySelection", "GET", "/relaySelection", object({
            relayLocation: string(), weightGrams: number(),
        }), { externalOrderId: string() }, undefined, "system"),
        endpoint("saveClaimReturnRelaySelection", "POST", "/saveClaimReturnRelaySelection", object({
            externalOrderId: string(), relayLocation: string(), country: string(), number: string(), name: string(),
            postalCode: string(), city: string(), weightGrams: number(), shippingAmount: number(), currency: string(),
        }), undefined, {
            externalOrderId: string(), relayLocation: string(), country: string(), postalCode: string(), city: string(),
        }, "system"),
        endpoint("saveRelaySelection", "POST", "/saveRelaySelection", object({
            externalOrderId: string(), relayLocation: string(), country: string(), number: string(), name: string(),
            postalCode: string(), city: string(), weightGrams: number(), shippingAmount: number(), currency: string(),
        }), undefined, {
            externalOrderId: string(), relayLocation: string(), country: string(), postalCode: string(), city: string(),
        }, "system"),
        endpoint("createShipment", "POST", "/createShipment", object({
            ok: boolean(), id: string(), expeditionNumber: string(), status: string(),
            trackingUrl: string(), createdAt: string(), idempotentReplay: boolean(),
        }), undefined, {
            externalOrderId: string(), sellerCmsUserId: { type: "string", semantic: "user-id" },
            deliveryQuoteId: string(), quoteExternalOrderId: string(), quotePurpose: string(),
            selectedForCmsUserId: { type: "string", semantic: "user-id" },
            senderName: string(), senderFirstName: string(), senderLastName: string(), senderEmail: string(),
            senderPhone: string(), senderAddressLine1: string(), senderAddressLine2: string(), senderAddressLine3: string(),
            senderPostalCode: string(), senderCity: string(), senderCountry: string(), recipientName: string(),
            recipientFirstName: string(), recipientLastName: string(), recipientEmail: string(),
            recipientPhone: string(), recipientAddressLine1: string(), recipientAddressLine2: string(),
            recipientAddressLine3: string(), recipientPostalCode: string(), recipientCity: string(),
            recipientCountry: string(), deliveryRelayLocation: string(), weightGrams: number(), packageCount: number(),
            declaredValueMinorAmount: number(), declaredCurrency: string(), metadata: object({
                commerceOrderId: string(), financialTermsHash: string(), commerceClaimId: number(), shipmentKind: string(),
                deliveryQuoteId: string(), declaredValueMinorAmount: number(), declaredCurrency: string(),
            }),
        }, "system", ["200", "201"]),
        endpoint("shipments", "GET", "/shipments", object({
            items: array({ id: string(), status: string() }), limit: number(), offset: number(),
        }), { externalOrderId: string(), limit: number(), offset: number() }),
        endpoint("shipment", "GET", "/shipment", object({
            id: string(), externalOrderId: string(), expeditionNumber: string(), status: string(), trackingUrl: string(),
            deliveryRelayLocation: string(), latestEventLabel: string(), latestEventAt: string(),
            carrierAcceptedAt: string(), sellerHandoffDeclaredAt: string(), recipientHandoffAt: string(),
            createdAt: string(), events: array({
                providerEventKey: string(), normalizedStatus: string(), occurredAt: string(),
                eventLabel: string(), eventDate: string(), eventTime: string(), location: string(),
            }),
        }), { id: string(), expeditionNumber: string() }),
        endpoint("tracking", "GET", "/tracking", object({
            expeditionNumber: string(), status: string(), carrierAcceptedAt: string(),
            recipientHandoffAt: string(), events: array({
                providerEventKey: string(), normalizedStatus: string(), occurredAt: string(),
                eventLabel: string(), eventDate: string(), eventTime: string(), location: string(),
            }),
        }), { expeditionNumber: string() }, undefined, "system"),
        endpoint("issueLabelAccess", "POST", "/issueLabelAccess", object({
            token: string(), expiresAt: string(),
        }), undefined, { externalOrderId: string(), sellerCmsUserId: string() }, "system", ["201"]),
        endpoint("declareSellerHandoff", "POST", "/declareSellerHandoff", object({
            id: string(), externalOrderId: string(), expeditionNumber: string(), status: string(),
            sellerHandoffDeclaredAt: string(),
        }), undefined, { externalOrderId: string() }, "system"),
        endpoint("reconcileShipments", "POST", "/reconcileShipments", object({
            processed: number(), shipments: array({ id: string(), status: string() }),
            events: array({
                eventId: number(), claimToken: string(), projectionAttempts: number(),
                orderPublicId: string(), providerEventId: string(), normalizedStatus: string(),
                occurredAt: string(), providerReference: string(), carrierAcceptedAt: string(),
                recipientHandoffAt: string(),
            }),
            claimReturnEvents: array({
                eventId: number(), claimToken: string(), projectionAttempts: number(),
                claimId: number(), externalOrderId: string(), providerEventId: string(), normalizedStatus: string(),
                occurredAt: string(), providerReference: string(),
                providerEvidence: object({ provider: string(), providerStatus: string() }),
            }),
        }), undefined, { runKey: string(), limit: number() }, "system"),
        endpoint("acknowledgeShipmentEvent", "POST", "/acknowledgeShipmentEvent", object({
            acknowledged: boolean(),
        }), undefined, { eventId: number(), claimToken: string() }, "system"),
        endpoint("failShipmentEventProjection", "POST", "/failShipmentEventProjection", object({
            id: number(), projectionStatus: string(), projectionAttempts: number(),
            projectionNextAttemptAt: string(), projectionLastError: string(), projectionManualReviewAt: string(),
        }), undefined, { eventId: number(), claimToken: string(), error: string() }, "system"),
        endpoint("deliveryProjectionHealth", "GET", "/deliveryProjectionHealth", object({
            checkedAt: string(), pendingProjectionCount: number(), manualReviewCount: number(), trackingErrorCount: number(),
            orders: array({
                externalOrderId: string(), shipmentId: string(), providerReference: string(), shipmentStatus: string(),
                pendingProjectionCount: number(), manualReviewCount: number(), trackingErrorCount: number(),
                trackingCheckedAt: string(),
            }),
        }), undefined, undefined, "system"),
        endpoint("recoverUnknownShipment", "POST", "/recoverUnknownShipment", object({
            id: string(), externalOrderId: string(), expeditionNumber: string(), status: string(),
        }), undefined, {
            shipmentId: string(), externalOrderId: string(), expeditionNumber: string(), labelUrl: string(), reason: string(),
        }, "admin"),
        endpoint("cancelShipmentReservation", "POST", "/cancelShipmentReservation", object({
            id: string(), externalOrderId: string(), expeditionNumber: string(), status: string(),
        }), undefined, { externalOrderId: string(), trackingUntil: string() }, "system"),
    ]);
    const accounts = makeSource("accounts", [
        endpoint("getAccountByUserId", "GET", "/getAccountByUserId", object({
            givenName: string(), surname: string(), phone: string(), addressLine1: string(),
            addressLine2: string(), addressLine3: string(), postalCode: string(),
            city: string(), countryCode: string(),
        }), { userId: { type: "string", semantic: "user-id" } }),
    ]);
    await repository.createSource(commerce);
    await repository.createSource(delivery);
    await repository.createSource(accounts);
    return repository;
}

function makeSource(id: string, endpoints: SourceEndpoint[]): Source {
    return { urn: makeSourceUrn(id), endpoints };
}

function endpoint(
    id: string,
    method: "GET" | "POST",
    path: string,
    output: DataShape,
    params?: Record<string, DataShape>,
    body?: Record<string, DataShape>,
    access: "admin" | "auth" | "system" = "admin",
    statuses = ["200"],
): SourceEndpoint {
    return {
        urn: makeEndpointUrn(path.includes("getAccount") ? "accounts" : deliveryPath(path) ? "delivery" : "commerce", id),
        method,
        access: { mode: access },
        targetUrl: `https://provider.test${path}`,
        input: method === "GET"
            ? { params: Object.entries(params ?? {}).map(([name, schema]) => ({ name, in: "query" as const, schema })) }
            : { body: object(body ?? {}) },
        output: statuses.map(status => ({
            status,
            body: Number(status) >= 400 ? object({ error: string() }) : output,
        })),
    };
}

function deliveryPath(path: string): boolean {
    return [
        "/resolveDeliveryQuote", "/saveClaimReturnRelaySelection",
        "/relaySelection", "/saveRelaySelection", "/createShipment", "/shipments", "/shipment",
        "/tracking",
        "/issueLabelAccess", "/declareSellerHandoff", "/reconcileShipments", "/acknowledgeShipmentEvent",
        "/failShipmentEventProjection",
        "/cancelShipmentReservation", "/deliveryProjectionHealth", "/recoverUnknownShipment",
    ].includes(path);
}

function fulfillmentAddressShape(): DataShape {
    return object({
        name: string(), firstName: string(), lastName: string(), phone: string(),
        addressLine1: string(), addressLine2: string(), addressLine3: string(),
        postalCode: string(), city: string(), country: string(), email: string(),
    });
}

function fulfillmentQuote() {
    return {
        quoteId: "quote-42", externalOrderId: "order-public-42", orderVersion: 1, revision: 1,
        selectedForCmsUserId: "buyer-subject", relayLocation: "FR-024474", country: "FR",
        number: "024474", name: "Relay", addressLine1: "3 Relay Street", addressLine2: "",
        postalCode: "75002", city: "Paris", weightGrams: 500, shippingAmount: 450,
        currency: "EUR", merchandiseSubtotalMinorAmount: 11000,
        quotedAt: "2026-07-12T09:00:00.000Z", expiresAt: "2099-07-12T09:15:00.000Z",
        recipientSnapshot: {
            name: "Alice Buyer", firstName: "Alice", lastName: "Buyer", email: "",
            phone: "+33600000000", addressLine1: "1 rue du Test", addressLine2: "", addressLine3: "",
            postalCode: "75001", city: "Paris", country: "FR",
        },
        sellerFulfillmentSnapshot: {
            name: "Seller Test", firstName: "Seller", lastName: "Test", email: "",
            phone: "+33611111111", addressLine1: "2 rue du Vendeur", addressLine2: "", addressLine3: "",
            postalCode: "69001", city: "Lyon", country: "FR",
        },
    };
}

async function installationsForFulfillment(): Promise<InMemoryIntegrationInstallationRepository> {
    const repository = new InMemoryIntegrationInstallationRepository();
    for (const [id, sourceId] of [
        ["commerce", "commerce"],
        ["mondial-relay", "delivery"],
    ]) {
        await repository.create({
            id,
            label: id,
            definitionVersion: "1.0.0",
            status: "success",
            answersSnapshot: { id: sourceId },
            secretRefs: {},
            secretInputs: [],
            artifacts: [{ type: "source", id: `urn:${sourceId}`, action: "created" }],
            runs: [],
        });
    }
    return repository;
}

async function requiredFunction(repository: InMemoryFunctionRepository, id: string) {
    const fn = await repository.getFunction(id);
    if (!fn) throw new Error(`function ${id} not installed`);
    return fn;
}

function request(id: string, body: unknown): Request {
    return new Request(`https://cms.test/functions/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

async function reconciliationHealthResponse(request: Request): Promise<Response | null> {
    const path = new URL(request.url).pathname;
    if (path === "/deliveryProjectionHealth") {
        return Response.json({
            checkedAt: "2026-07-13T09:31:00.000Z",
            pendingProjectionCount: 0,
            manualReviewCount: 0,
            trackingErrorCount: 0,
            orders: [],
        });
    }
    if (path === "/recordDeliveryReconciliationHealth") {
        return Response.json(await request.json());
    }
    return null;
}
