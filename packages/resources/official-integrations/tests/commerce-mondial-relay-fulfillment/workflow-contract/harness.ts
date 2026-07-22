import { importIntegration, InMemoryIntegrationInstallationRepository } from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { InMemoryFunctionRepository } from "@bernouy/cms-functions";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryRolesRepository } from "@bernouy/cms-permissions";
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

export async function installedFunctions() {
    const sources = await sourcesForFulfillment();
    const functions = new InMemoryFunctionRepository();
    const installations = await installationsForFulfillment();
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get(
        "commerce-mondial-relay-fulfillment",
    );
    if (!definition) {
        throw new Error("fulfillment definition not found");
    }
    await importIntegration(
        {
            sources,
            functions,
            installations,
            roles: new InMemoryRolesRepository(),
            blocs: {
                async importBloc(artifact) {
                    return { id: artifact.tag, action: "created" };
                },
            },
        },
        { kind: definition.kind, answers: {}, options: {} },
        [definition],
    );
    return { sources, functions };
}

export async function sourcesForFulfillment(): Promise<InMemorySourceRepository> {
    const repository = new InMemorySourceRepository();
    const commerce = makeSource("commerce", [
        endpoint(
            "getOrderFulfillmentBuyerContext",
            "GET",
            "/system/order/payment-context",
            object({
                id: number(),
                publicId: string(),
                buyerCmsUserId: string(),
            }),
            { orderId: string() },
            undefined,
            "system",
        ),
        endpoint(
            "getOrderFulfillmentSellerContext",
            "GET",
            "/seller-context",
            object({
                id: number(),
                publicId: string(),
                orderNumber: string(),
            }),
            { orderId: string() },
            undefined,
            "system",
        ),
        endpoint(
            "getOrderShipmentCreationSellerContext",
            "GET",
            "/shipment-creation-seller-context",
            object({
                id: number(),
                publicId: string(),
                allowed: boolean(),
                sellerId: { type: "string", semantic: "user-id" },
            }),
            { orderId: string() },
            undefined,
            "system",
        ),
        endpoint(
            "getOrderLabelSellerContext",
            "GET",
            "/label-seller-context",
            object({
                publicId: string(),
                allowed: boolean(),
                sellerCmsUserId: { type: "string", semantic: "user-id" },
            }),
            { orderId: string() },
            undefined,
            "system",
        ),
        endpoint(
            "mySale",
            "GET",
            "/mySale",
            object({
                id: number(),
                publicId: string(),
                orderNumber: string(),
                sellerId: { type: "string", semantic: "user-id" },
                fulfillmentStatus: string(),
            }),
            { id: string() },
            undefined,
            "auth",
        ),
        endpoint(
            "order",
            "GET",
            "/order",
            object({
                id: number(),
                publicId: string(),
                shippingAddress: object({
                    recipient: string(),
                    givenName: string(),
                    surname: string(),
                    phone: string(),
                    addressLine1: string(),
                    addressLine2: string(),
                    addressLine3: string(),
                    postalCode: string(),
                    city: string(),
                    countryCode: string(),
                }),
            }),
            { id: string() },
        ),
        endpoint(
            "getOrderFulfillmentAuthorization",
            "GET",
            "/fulfillment-authorization",
            object({
                allowed: boolean(),
                reason: { type: "string", nullable: true },
                orderId: number(),
                orderPublicId: string(),
                sellerId: { type: "string", semantic: "user-id" },
                buyerCmsUserId: string(),
                currency: string(),
                deliveryQuoteId: string(),
                merchandiseSubtotalMinorAmount: number(),
                shippingAmount: number(),
                buyerTotalAmount: number(),
                financialTermsHash: string(),
                paymentStatus: string(),
                fulfillmentStatus: string(),
            }),
            { orderPublicId: string() },
            undefined,
            "system",
        ),
        endpoint(
            "reserveOrderShipmentCreation",
            "POST",
            "/reserveShipmentCreation",
            object({
                operationId: number(),
                claimToken: string(),
                orderId: number(),
                orderPublicId: string(),
                sellerId: { type: "string", semantic: "user-id" },
                buyerCmsUserId: string(),
                currency: string(),
                deliveryQuoteId: string(),
                merchandiseSubtotalMinorAmount: number(),
                shippingAmount: number(),
                buyerTotalAmount: number(),
                financialTermsHash: string(),
                paymentStatus: string(),
                fulfillmentStatus: string(),
            }),
            undefined,
            { orderPublicId: string(), workerId: string() },
            "system",
            ["200", "409"],
        ),
        endpoint(
            "getOrderLabelAuthorization",
            "GET",
            "/label-authorization",
            object({
                allowed: boolean(),
                reason: string(),
                orderId: number(),
                orderPublicId: string(),
                sellerId: { type: "string", semantic: "user-id" },
                sellerCmsUserId: { type: "string", semantic: "user-id" },
                providerReference: string(),
            }),
            { orderPublicId: string() },
            undefined,
            "system",
        ),
        endpoint(
            "completeOrderShipmentCreation",
            "POST",
            "/completeShipmentCreation",
            object({
                orderId: number(),
                orderPublicId: string(),
                status: string(),
                providerReference: string(),
                version: number(),
            }),
            undefined,
            {
                operationId: number(),
                claimToken: string(),
                providerReference: string(),
                providerShipmentId: string(),
                providerSnapshot: object({ status: string(), createdAt: string() }),
            },
            "system",
        ),
        endpoint(
            "claimPendingShipmentCreations",
            "POST",
            "/claimShipmentCreations",
            object({
                items: array({
                    operationId: number(),
                    claimToken: string(),
                    orderPublicId: string(),
                    sellerId: { type: "string", semantic: "user-id" },
                    buyerCmsUserId: string(),
                    deliveryQuoteId: string(),
                    merchandiseSubtotalMinorAmount: number(),
                    currency: string(),
                    financialTermsHash: string(),
                }),
            }),
            undefined,
            { runKey: string(), limit: number() },
            "system",
        ),
        endpoint(
            "failOrderShipmentCreation",
            "POST",
            "/failShipmentCreation",
            object({
                operationId: number(),
                status: string(),
            }),
            undefined,
            { operationId: number(), claimToken: string(), error: string() },
            "system",
        ),
        endpoint(
            "claimPendingShipmentCancellations",
            "POST",
            "/claimShipmentCancellations",
            object({
                items: array({
                    operationId: number(),
                    claimToken: string(),
                    orderPublicId: string(),
                    trackingUntil: string(),
                }),
            }),
            undefined,
            { runKey: string(), limit: number() },
            "system",
        ),
        endpoint(
            "completeOrderShipmentCancellation",
            "POST",
            "/completeShipmentCancellation",
            object({
                operationId: number(),
                status: string(),
            }),
            undefined,
            {
                operationId: number(),
                claimToken: string(),
                providerStatus: string(),
                providerReference: string(),
                providerSnapshot: object({
                    id: string(),
                    externalOrderId: string(),
                    expeditionNumber: string(),
                    status: string(),
                }),
            },
            "system",
        ),
        endpoint(
            "failOrderShipmentCancellation",
            "POST",
            "/failShipmentCancellation",
            object({
                operationId: number(),
                status: string(),
            }),
            undefined,
            { operationId: number(), claimToken: string(), error: string() },
            "system",
        ),
        endpoint(
            "recordDeliveryReconciliationHealth",
            "POST",
            "/recordDeliveryReconciliationHealth",
            object({
                runKey: string(),
                checkedAt: string(),
                pendingProjectionCount: number(),
                manualReviewCount: number(),
                trackingErrorCount: number(),
            }),
            undefined,
            {
                runKey: string(),
                checkedAt: string(),
                pendingProjectionCount: number(),
                manualReviewCount: number(),
                trackingErrorCount: number(),
            },
            "system",
        ),
        endpoint(
            "recordDeliveryOrderReconciliationHealth",
            "POST",
            "/recordDeliveryOrderReconciliationHealth",
            object({
                orderPublicId: string(),
                checkedAt: string(),
                pendingProjectionCount: number(),
                manualReviewCount: number(),
                trackingErrorCount: number(),
            }),
            undefined,
            {
                runKey: string(),
                checkedAt: string(),
                orderPublicId: string(),
                shipmentId: string(),
                providerReference: string(),
                shipmentStatus: string(),
                pendingProjectionCount: number(),
                manualReviewCount: number(),
                trackingErrorCount: number(),
                trackingCheckedAt: string(),
            },
            "system",
        ),
        endpoint(
            "recoverOrderShipmentCreation",
            "POST",
            "/recoverOrderShipmentCreation",
            object({
                status: string(),
                providerReference: string(),
            }),
            undefined,
            {
                orderPublicId: string(),
                providerReference: string(),
                providerShipmentId: string(),
                reason: string(),
                providerSnapshot: object({
                    id: string(),
                    externalOrderId: string(),
                    expeditionNumber: string(),
                    status: string(),
                }),
            },
            "admin",
        ),
        endpoint(
            "getClaimReturnAuthorization",
            "GET",
            "/claim-return-authorization",
            object({
                allowed: boolean(),
                reason: string(),
                claimId: number(),
                claimPublicId: string(),
                claimStatus: string(),
                claimVersion: number(),
                returnShipByAt: string(),
                returnDeliveryStatus: string(),
                orderId: number(),
                orderPublicId: string(),
                orderNumber: string(),
                buyerCmsUserId: { type: "string", semantic: "user-id" },
                sellerId: number(),
                sellerCmsUserId: { type: "string", semantic: "user-id" },
                deliveryQuoteId: string(),
                merchandiseSubtotalMinorAmount: number(),
                currency: string(),
            }),
            { claimId: number() },
            undefined,
            "system",
        ),
        endpoint(
            "recordOrderFulfillment",
            "POST",
            "/recordOrderFulfillment",
            object({
                orderId: number(),
                orderPublicId: string(),
                status: string(),
                providerReference: string(),
                carrierAcceptedAt: string(),
                sellerHandoffDeclaredAt: string(),
                recipientHandoffAt: string(),
                claimByAt: string(),
                releaseEligibleAt: string(),
                blockingReason: string(),
                version: number(),
            }),
            undefined,
            {
                orderPublicId: string(),
                providerEventId: string(),
                normalizedStatus: string(),
                occurredAt: string(),
                providerReference: string(),
                recipientHandoffAt: string(),
                carrierAcceptedAt: string(),
                sellerHandoffDeclaredAt: string(),
            },
            "system",
        ),
        endpoint(
            "recordClaimReturnDelivery",
            "POST",
            "/recordClaimReturnDelivery",
            object({
                id: number(),
                status: string(),
                returnDeliveryStatus: string(),
            }),
            undefined,
            {
                claimId: number(),
                providerEventId: string(),
                providerReference: string(),
                normalizedStatus: string(),
                occurredAt: string(),
                providerEvidence: object({
                    provider: string(),
                    shipmentId: string(),
                    providerStatus: string(),
                }),
            },
            "system",
        ),
    ]);
    const delivery = makeSource("delivery", [
        endpoint(
            "resolveDeliveryQuote",
            "POST",
            "/resolveDeliveryQuote",
            object({
                quoteId: string(),
                externalOrderId: string(),
                orderVersion: number(),
                revision: number(),
                selectedForCmsUserId: { type: "string", semantic: "user-id" },
                relayLocation: string(),
                country: string(),
                number: string(),
                name: string(),
                addressLine1: string(),
                addressLine2: string(),
                postalCode: string(),
                city: string(),
                weightGrams: number(),
                shippingAmount: number(),
                currency: string(),
                merchandiseSubtotalMinorAmount: number(),
                quotedAt: string(),
                expiresAt: string(),
                recipientSnapshot: fulfillmentAddressShape(),
                sellerFulfillmentSnapshot: fulfillmentAddressShape(),
            }),
            undefined,
            {
                quoteId: string(),
                externalOrderId: string(),
                selectedForCmsUserId: { type: "string", semantic: "user-id" },
                orderVersion: number(),
                merchandiseSubtotalMinorAmount: number(),
                currency: string(),
                purpose: string(),
            },
            "system",
        ),
        endpoint(
            "relaySelection",
            "GET",
            "/relaySelection",
            object({
                relayLocation: string(),
                weightGrams: number(),
            }),
            { externalOrderId: string() },
            undefined,
            "system",
        ),
        endpoint(
            "saveClaimReturnRelaySelection",
            "POST",
            "/saveClaimReturnRelaySelection",
            object({
                externalOrderId: string(),
                relayLocation: string(),
                country: string(),
                number: string(),
                name: string(),
                postalCode: string(),
                city: string(),
                weightGrams: number(),
                shippingAmount: number(),
                currency: string(),
            }),
            undefined,
            {
                externalOrderId: string(),
                relayLocation: string(),
                country: string(),
                postalCode: string(),
                city: string(),
            },
            "system",
        ),
        endpoint(
            "saveRelaySelection",
            "POST",
            "/saveRelaySelection",
            object({
                externalOrderId: string(),
                relayLocation: string(),
                country: string(),
                number: string(),
                name: string(),
                postalCode: string(),
                city: string(),
                weightGrams: number(),
                shippingAmount: number(),
                currency: string(),
            }),
            undefined,
            {
                externalOrderId: string(),
                relayLocation: string(),
                country: string(),
                postalCode: string(),
                city: string(),
            },
            "system",
        ),
        endpoint(
            "createShipment",
            "POST",
            "/createShipment",
            object({
                ok: boolean(),
                id: string(),
                expeditionNumber: string(),
                status: string(),
                trackingUrl: string(),
                createdAt: string(),
                idempotentReplay: boolean(),
            }),
            undefined,
            {
                externalOrderId: string(),
                sellerCmsUserId: { type: "string", semantic: "user-id" },
                deliveryQuoteId: string(),
                quoteExternalOrderId: string(),
                quotePurpose: string(),
                selectedForCmsUserId: { type: "string", semantic: "user-id" },
                senderName: string(),
                senderFirstName: string(),
                senderLastName: string(),
                senderEmail: string(),
                senderPhone: string(),
                senderAddressLine1: string(),
                senderAddressLine2: string(),
                senderAddressLine3: string(),
                senderPostalCode: string(),
                senderCity: string(),
                senderCountry: string(),
                recipientName: string(),
                recipientFirstName: string(),
                recipientLastName: string(),
                recipientEmail: string(),
                recipientPhone: string(),
                recipientAddressLine1: string(),
                recipientAddressLine2: string(),
                recipientAddressLine3: string(),
                recipientPostalCode: string(),
                recipientCity: string(),
                recipientCountry: string(),
                deliveryRelayLocation: string(),
                weightGrams: number(),
                packageCount: number(),
                declaredValueMinorAmount: number(),
                declaredCurrency: string(),
                metadata: object({
                    commerceOrderId: string(),
                    financialTermsHash: string(),
                    commerceClaimId: number(),
                    shipmentKind: string(),
                    deliveryQuoteId: string(),
                    declaredValueMinorAmount: number(),
                    declaredCurrency: string(),
                }),
            },
            "system",
            ["200", "201"],
        ),
        endpoint(
            "shipments",
            "GET",
            "/shipments",
            object({
                items: array({ id: string(), status: string() }),
                limit: number(),
                offset: number(),
            }),
            { externalOrderId: string(), limit: number(), offset: number() },
        ),
        endpoint(
            "shipmentForExternalOrder",
            "GET",
            "/shipmentForExternalOrder",
            object({
                items: array({
                    id: string(),
                    expeditionNumber: string(),
                    status: string(),
                    trackingUrl: string(),
                    deliveryRelayLocation: string(),
                    latestEventLabel: string(),
                    latestEventAt: string(),
                    carrierAcceptedAt: string(),
                    sellerHandoffDeclaredAt: string(),
                    recipientHandoffAt: string(),
                    createdAt: string(),
                    events: array({
                        normalizedStatus: string(),
                        occurredAt: string(),
                        eventLabel: string(),
                        eventDate: string(),
                        eventTime: string(),
                        location: string(),
                    }),
                }),
            }),
            { externalOrderId: string() },
            undefined,
            "system",
        ),
        endpoint(
            "shipment",
            "GET",
            "/shipment",
            object({
                id: string(),
                externalOrderId: string(),
                expeditionNumber: string(),
                status: string(),
                trackingUrl: string(),
                deliveryRelayLocation: string(),
                latestEventLabel: string(),
                latestEventAt: string(),
                carrierAcceptedAt: string(),
                sellerHandoffDeclaredAt: string(),
                recipientHandoffAt: string(),
                createdAt: string(),
                events: array({
                    providerEventKey: string(),
                    normalizedStatus: string(),
                    occurredAt: string(),
                    eventLabel: string(),
                    eventDate: string(),
                    eventTime: string(),
                    location: string(),
                }),
            }),
            { id: string(), expeditionNumber: string() },
        ),
        endpoint(
            "tracking",
            "GET",
            "/tracking",
            object({
                expeditionNumber: string(),
                status: string(),
                carrierAcceptedAt: string(),
                recipientHandoffAt: string(),
                events: array({
                    providerEventKey: string(),
                    normalizedStatus: string(),
                    occurredAt: string(),
                    eventLabel: string(),
                    eventDate: string(),
                    eventTime: string(),
                    location: string(),
                }),
            }),
            { expeditionNumber: string() },
            undefined,
            "system",
        ),
        endpoint(
            "shipmentTrackingContext",
            "GET",
            "/shipmentTrackingContext",
            object({
                shipment: object({
                    id: string(),
                    externalOrderId: string(),
                    expeditionNumber: string(),
                    status: string(),
                    recipientHandoffAt: string(),
                }),
                tracking: object({
                    expeditionNumber: string(),
                    status: string(),
                    carrierAcceptedAt: string(),
                    recipientHandoffAt: string(),
                    events: array({
                        providerEventKey: string(),
                        normalizedStatus: string(),
                        occurredAt: string(),
                        eventLabel: string(),
                        eventDate: string(),
                        eventTime: string(),
                        location: string(),
                    }),
                }),
            }),
            { expeditionNumber: string(), expectedExternalOrderId: string() },
            undefined,
            "system",
        ),
        endpoint(
            "issueLabelAccess",
            "POST",
            "/issueLabelAccess",
            object({
                token: string(),
                expiresAt: string(),
            }),
            undefined,
            { externalOrderId: string(), sellerCmsUserId: string() },
            "system",
            ["201"],
        ),
        endpoint(
            "declareSellerHandoff",
            "POST",
            "/declareSellerHandoff",
            object({
                id: string(),
                externalOrderId: string(),
                expeditionNumber: string(),
                status: string(),
                sellerHandoffDeclaredAt: string(),
            }),
            undefined,
            { externalOrderId: string() },
            "system",
        ),
        endpoint(
            "reconcileShipments",
            "POST",
            "/reconcileShipments",
            object({
                processed: number(),
                shipments: array({ id: string(), status: string() }),
                events: array({
                    eventId: number(),
                    claimToken: string(),
                    projectionAttempts: number(),
                    orderPublicId: string(),
                    providerEventId: string(),
                    normalizedStatus: string(),
                    occurredAt: string(),
                    providerReference: string(),
                    carrierAcceptedAt: string(),
                    recipientHandoffAt: string(),
                }),
                claimReturnEvents: array({
                    eventId: number(),
                    claimToken: string(),
                    projectionAttempts: number(),
                    claimId: number(),
                    externalOrderId: string(),
                    providerEventId: string(),
                    normalizedStatus: string(),
                    occurredAt: string(),
                    providerReference: string(),
                    providerEvidence: object({ provider: string(), providerStatus: string() }),
                }),
            }),
            undefined,
            { runKey: string(), limit: number() },
            "system",
        ),
        endpoint(
            "acknowledgeShipmentEvent",
            "POST",
            "/acknowledgeShipmentEvent",
            object({
                acknowledged: boolean(),
            }),
            undefined,
            { eventId: number(), claimToken: string() },
            "system",
        ),
        endpoint(
            "failShipmentEventProjection",
            "POST",
            "/failShipmentEventProjection",
            object({
                id: number(),
                projectionStatus: string(),
                projectionAttempts: number(),
                projectionNextAttemptAt: string(),
                projectionLastError: string(),
                projectionManualReviewAt: string(),
            }),
            undefined,
            { eventId: number(), claimToken: string(), error: string() },
            "system",
        ),
        endpoint(
            "deliveryProjectionHealth",
            "GET",
            "/deliveryProjectionHealth",
            object({
                checkedAt: string(),
                pendingProjectionCount: number(),
                manualReviewCount: number(),
                trackingErrorCount: number(),
                orders: array({
                    externalOrderId: string(),
                    shipmentId: string(),
                    providerReference: string(),
                    shipmentStatus: string(),
                    pendingProjectionCount: number(),
                    manualReviewCount: number(),
                    trackingErrorCount: number(),
                    trackingCheckedAt: string(),
                }),
            }),
            undefined,
            undefined,
            "system",
        ),
        endpoint(
            "recoverUnknownShipment",
            "POST",
            "/recoverUnknownShipment",
            object({
                id: string(),
                externalOrderId: string(),
                expeditionNumber: string(),
                status: string(),
            }),
            undefined,
            {
                shipmentId: string(),
                externalOrderId: string(),
                expeditionNumber: string(),
                labelUrl: string(),
                reason: string(),
            },
            "admin",
        ),
        endpoint(
            "cancelShipmentReservation",
            "POST",
            "/cancelShipmentReservation",
            object({
                id: string(),
                externalOrderId: string(),
                expeditionNumber: string(),
                status: string(),
            }),
            undefined,
            { externalOrderId: string(), trackingUntil: string() },
            "system",
        ),
    ]);
    const accounts = makeSource("accounts", [
        endpoint(
            "getAccountByUserId",
            "GET",
            "/getAccountByUserId",
            object({
                givenName: string(),
                surname: string(),
                phone: string(),
                addressLine1: string(),
                addressLine2: string(),
                addressLine3: string(),
                postalCode: string(),
                city: string(),
                countryCode: string(),
            }),
            { userId: { type: "string", semantic: "user-id" } },
        ),
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
        urn: makeEndpointUrn(
            path.includes("getAccount") ? "accounts" : deliveryPath(path) ? "delivery" : "commerce",
            id,
        ),
        method,
        access: { mode: access },
        targetUrl: `https://provider.test${path}`,
        input:
            method === "GET"
                ? {
                      params: Object.entries(params ?? {}).map(([name, schema]) => ({
                          name,
                          in: "query" as const,
                          schema,
                      })),
                  }
                : { body: object(body ?? {}) },
        output: statuses.map((status) => ({
            status,
            body: Number(status) >= 400 ? object({ error: string() }) : output,
        })),
    };
}

function deliveryPath(path: string): boolean {
    return [
        "/resolveDeliveryQuote",
        "/saveClaimReturnRelaySelection",
        "/relaySelection",
        "/saveRelaySelection",
        "/createShipment",
        "/shipments",
        "/shipmentForExternalOrder",
        "/shipment",
        "/tracking",
        "/shipmentTrackingContext",
        "/issueLabelAccess",
        "/declareSellerHandoff",
        "/reconcileShipments",
        "/acknowledgeShipmentEvent",
        "/failShipmentEventProjection",
        "/cancelShipmentReservation",
        "/deliveryProjectionHealth",
        "/recoverUnknownShipment",
    ].includes(path);
}

function fulfillmentAddressShape(): DataShape {
    return object({
        name: string(),
        firstName: string(),
        lastName: string(),
        phone: string(),
        addressLine1: string(),
        addressLine2: string(),
        addressLine3: string(),
        postalCode: string(),
        city: string(),
        country: string(),
        email: string(),
    });
}

export function fulfillmentQuote() {
    return {
        quoteId: "quote-42",
        externalOrderId: "order-public-42",
        orderVersion: 1,
        revision: 1,
        selectedForCmsUserId: "buyer-subject",
        relayLocation: "FR-024474",
        country: "FR",
        number: "024474",
        name: "Relay",
        addressLine1: "3 Relay Street",
        addressLine2: "",
        postalCode: "75002",
        city: "Paris",
        weightGrams: 500,
        shippingAmount: 450,
        currency: "EUR",
        merchandiseSubtotalMinorAmount: 11000,
        quotedAt: "2026-07-12T09:00:00.000Z",
        expiresAt: "2099-07-12T09:15:00.000Z",
        recipientSnapshot: {
            name: "Alice Buyer",
            firstName: "Alice",
            lastName: "Buyer",
            email: "",
            phone: "+33600000000",
            addressLine1: "1 rue du Test",
            addressLine2: "",
            addressLine3: "",
            postalCode: "75001",
            city: "Paris",
            country: "FR",
        },
        sellerFulfillmentSnapshot: {
            name: "Seller Test",
            firstName: "Seller",
            lastName: "Test",
            email: "",
            phone: "+33611111111",
            addressLine1: "2 rue du Vendeur",
            addressLine2: "",
            addressLine3: "",
            postalCode: "69001",
            city: "Lyon",
            country: "FR",
        },
    };
}

export async function installationsForFulfillment(): Promise<InMemoryIntegrationInstallationRepository> {
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

export async function requiredFunction(repository: InMemoryFunctionRepository, id: string) {
    const fn = await repository.getFunction(id);
    if (!fn) {
        throw new Error(`function ${id} not installed`);
    }
    return fn;
}

export function request(id: string, body: unknown): Request {
    return new Request(`https://cms.test/functions/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

export async function reconciliationHealthResponse(request: Request): Promise<Response | null> {
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
