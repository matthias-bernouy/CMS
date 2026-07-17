import {
    makeEndpointUrn,
    makeSourceUrn,
    type DataShape,
    type Source,
} from "@bernouy/cms-sources";
import {
    computedUserHeader,
    number,
    object,
    text,
    userId,
} from "./shapes";

export function deliverySource(): Source {
    const selectionInput = object({
        requestKey: text(),
        externalOrderId: text(),
        orderVersion: number(),
        selectedForCmsUserId: userId(),
        relayLocation: text(),
        country: text(),
        postalCode: text(),
        city: text(),
        currency: text(),
        merchandiseSubtotalMinorAmount: number(),
        recipientSnapshot: object(),
        sellerFulfillmentSnapshot: object(),
    });
    const quoteInput = object({
        quoteId: text(),
        externalOrderId: text(),
        selectedForCmsUserId: userId(),
        orderVersion: number(),
        merchandiseSubtotalMinorAmount: number(),
        currency: text(),
        purpose: text(),
    });
    return {
        urn: makeSourceUrn("delivery"),
        endpoints: [{
            urn: makeEndpointUrn("delivery", "saveRelaySelection"),
            method: "POST",
            targetUrl: "https://delivery.test/relay-selection",
            headers: computedUserHeader(),
            input: { body: {
                ...selectionInput,
                required: [
                    "requestKey",
                    "externalOrderId",
                    "orderVersion",
                    "selectedForCmsUserId",
                    "relayLocation",
                    "country",
                    "postalCode",
                    "currency",
                    "merchandiseSubtotalMinorAmount",
                    "recipientSnapshot",
                    "sellerFulfillmentSnapshot",
                ],
            } },
            output: quoteOutputs(false, true, true),
        }, {
            urn: makeEndpointUrn("delivery", "resolveDeliveryQuote"),
            method: "POST",
            targetUrl: "https://delivery.test/resolve",
            input: { body: {
                ...quoteInput,
                required: [
                    "quoteId",
                    "externalOrderId",
                    "selectedForCmsUserId",
                    "purpose",
                ],
            } },
            output: quoteOutputs(true, false, true),
        }, {
            urn: makeEndpointUrn("delivery", "deliveryQuote"),
            method: "GET",
            targetUrl: "https://delivery.test/public",
            input: { params: [
                {
                    name: "quoteId",
                    in: "query",
                    required: true,
                    schema: text(),
                },
                {
                    name: "externalOrderId",
                    in: "query",
                    required: true,
                    schema: text(),
                },
                {
                    name: "selectedForCmsUserId",
                    in: "query",
                    required: true,
                    schema: userId(),
                },
            ] },
            output: quoteOutputs(false),
        }],
    };
}

function quoteOutputs(
    includeSnapshots: boolean,
    includeCoordinates = false,
    includeInternalRequirements = false,
) {
    const properties: Record<string, DataShape> = {
        quoteId: text(),
        externalOrderId: text(),
        orderVersion: number(),
        revision: number(),
        selectedForCmsUserId: userId(),
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
    };
    if (includeCoordinates) {
        properties.latitude = number(true);
        properties.longitude = number(true);
    }
    if (includeSnapshots) {
        properties.recipientSnapshot = object();
        properties.sellerFulfillmentSnapshot = object();
    }
    const required = [
        "quoteId",
        "externalOrderId",
        ...(includeInternalRequirements
            ? ["orderVersion", "revision", "selectedForCmsUserId"]
            : []),
        "relayLocation",
        "country",
        "number",
        "name",
        "postalCode",
        "city",
        "weightGrams",
        "shippingAmount",
        "currency",
        ...(includeInternalRequirements
            ? ["merchandiseSubtotalMinorAmount"]
            : []),
        ...(includeSnapshots
            ? ["recipientSnapshot", "sellerFulfillmentSnapshot"]
            : []),
        "quotedAt",
        "expiresAt",
    ];
    return [
        { status: "200", body: { ...object(properties), required } },
        { status: "409", body: object({ error: text() }) },
    ];
}
