import { makeEndpointUrn, type SourceEndpoint } from "@bernouy/cms-sources";
import {
    boolean,
    computedUserHeader,
    number,
    object,
    text,
} from "../../order-contexts/shared/shapes";

export function creationDeliveryEndpoints(): SourceEndpoint[] {
    return [resolveQuote(), createShipment()];
}

function resolveQuote(): SourceEndpoint {
    return {
        urn: makeEndpointUrn("delivery", "resolveDeliveryQuote"),
        method: "POST",
        access: { mode: "system" },
        targetUrl: "https://delivery.test/resolveDeliveryQuote",
        input: {
            body: object({
                quoteId: text(),
                externalOrderId: text(),
                selectedForCmsUserId: text(),
                orderVersion: number(),
                merchandiseSubtotalMinorAmount: number(),
                currency: text(),
                purpose: text(),
            }, [
                "quoteId", "externalOrderId", "selectedForCmsUserId",
                "purpose",
            ]),
        },
        output: [{ status: "200", body: quoteShape() },
            errorOutput("404"), errorOutput("409")],
    };
}

function quoteShape() {
    const snapshot = object({
        name: text(),
        firstName: text(),
        lastName: text(),
        email: text(),
        phone: text(),
        addressLine1: text(),
        addressLine2: text(),
        addressLine3: text(),
        postalCode: text(),
        city: text(),
        country: text(),
    });
    return object({
        quoteId: text(),
        externalOrderId: text(),
        orderVersion: number(),
        revision: number(),
        selectedForCmsUserId: text(),
        relayLocation: text(),
        country: text(),
        number: text(),
        name: text(),
        addressLine1: text(),
        addressLine2: text(),
        postalCode: text(),
        city: text(),
        nature: text(),
        pointType: text(),
        weightGrams: number(),
        shippingAmount: number(),
        currency: text(),
        merchandiseSubtotalMinorAmount: number(),
        quotedAt: text(),
        expiresAt: text(),
        recipientSnapshot: snapshot,
        sellerFulfillmentSnapshot: snapshot,
    }, [
        "quoteId", "externalOrderId", "orderVersion", "revision",
        "selectedForCmsUserId", "relayLocation", "country", "number",
        "name", "postalCode", "city", "weightGrams", "shippingAmount",
        "currency", "merchandiseSubtotalMinorAmount", "quotedAt",
        "expiresAt", "recipientSnapshot", "sellerFulfillmentSnapshot",
    ]);
}

function createShipment(): SourceEndpoint {
    const body = object({
        externalOrderId: text(),
        sellerCmsUserId: text(),
        deliveryQuoteId: text(),
        quoteExternalOrderId: text(),
        quotePurpose: text(),
        selectedForCmsUserId: text(),
        senderName: text(),
        senderFirstName: text(),
        senderLastName: text(),
        senderEmail: text(),
        senderPhone: text(),
        senderAddressLine1: text(),
        senderAddressLine2: text(),
        senderAddressLine3: text(),
        senderPostalCode: text(),
        senderCity: text(),
        senderCountry: text(),
        recipientName: text(),
        recipientFirstName: text(),
        recipientLastName: text(),
        recipientEmail: text(),
        recipientPhone: text(),
        recipientAddressLine1: text(),
        recipientAddressLine2: text(),
        recipientAddressLine3: text(),
        recipientPostalCode: text(),
        recipientCity: text(),
        recipientCountry: text(),
        deliveryRelayLocation: text(),
        weightGrams: number(),
        packageCount: number(),
        declaredValueMinorAmount: number(),
        declaredCurrency: text(),
        metadata: object(),
    }, [
        "externalOrderId", "sellerCmsUserId", "declaredValueMinorAmount",
        "declaredCurrency", "recipientName", "recipientAddressLine1",
        "recipientPostalCode", "recipientCity", "deliveryRelayLocation",
    ]);
    return {
        urn: makeEndpointUrn("delivery", "createShipment"),
        method: "POST",
        access: { mode: "system" },
        targetUrl: "https://delivery.test/createShipment",
        headers: computedUserHeader(),
        input: { body },
        output: [shipmentOutput("201", false), shipmentOutput("200", true),
            errorOutput("400"), errorOutput("409")],
    };
}

function shipmentOutput(status: string, nullable: boolean) {
    return {
        status,
        body: object({
            ok: boolean(),
            id: text(),
            expeditionNumber: text(nullable),
            trackingUrl: text(nullable),
            status: text(),
            createdAt: text(),
            idempotentReplay: boolean(),
        }, ["ok", "id", "expeditionNumber", "status"]),
    };
}

function errorOutput(status: string) {
    return {
        status,
        body: object({ error: text() }, ["error"]),
    };
}
