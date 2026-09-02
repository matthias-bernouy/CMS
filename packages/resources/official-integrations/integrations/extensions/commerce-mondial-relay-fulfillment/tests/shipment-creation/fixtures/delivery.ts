import { buyerId, orderPublicId, reservation, sellerId } from "./context";

export const quote = {
    quoteId: "quote-42",
    externalOrderId: orderPublicId,
    orderVersion: 1,
    revision: 3,
    selectedForCmsUserId: buyerId,
    relayLocation: "FR-024474",
    country: "FR",
    number: "024474",
    name: "Relay",
    addressLine1: "3 Relay Street",
    addressLine2: "",
    postalCode: "75002",
    city: "Paris",
    nature: "REL",
    pointType: "24R",
    weightGrams: 500,
    shippingAmount: 450,
    currency: "EUR",
    merchandiseSubtotalMinorAmount: 11_000,
    quotedAt: "2026-07-21T07:45:00.000Z",
    expiresAt: "2026-07-21T08:00:00.000Z",
    recipientSnapshot: {
        name: "Alice Buyer",
        firstName: "Alice",
        lastName: "Buyer",
        email: "alice.private@example.test",
        phone: "+33600000000",
        addressLine1: "7 Private Street",
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
        email: "seller.private@example.test",
        phone: "+33611111111",
        addressLine1: "2 Seller Street",
        addressLine2: "",
        addressLine3: "",
        postalCode: "69001",
        city: "Lyon",
        country: "FR",
    },
};

export const shipment = {
    ok: true,
    id: "shipment-42",
    expeditionNumber: "12345678",
    trackingUrl: "https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=12345678&codePostal=75001",
    status: "label_ready",
    createdAt: "2026-07-21T08:01:00.000Z",
};

export const replayShipment = {
    ...shipment,
    idempotentReplay: true,
};

export function expectedQuoteRequest() {
    return {
        quoteId: reservation.deliveryQuoteId,
        externalOrderId: orderPublicId,
        selectedForCmsUserId: buyerId,
        merchandiseSubtotalMinorAmount: reservation.merchandiseSubtotalMinorAmount,
        currency: reservation.currency,
        purpose: "fulfillment",
    };
}

export function expectedShipmentRequest() {
    const recipient = quote.recipientSnapshot;
    const sender = quote.sellerFulfillmentSnapshot;
    return {
        externalOrderId: orderPublicId,
        sellerCmsUserId: sellerId,
        deliveryQuoteId: quote.quoteId,
        quoteExternalOrderId: quote.externalOrderId,
        quotePurpose: "fulfillment",
        selectedForCmsUserId: buyerId,
        senderName: sender.name,
        senderFirstName: sender.firstName,
        senderLastName: sender.lastName,
        senderEmail: sender.email,
        senderPhone: sender.phone,
        senderAddressLine1: sender.addressLine1,
        senderAddressLine2: sender.addressLine2,
        senderAddressLine3: sender.addressLine3,
        senderPostalCode: sender.postalCode,
        senderCity: sender.city,
        senderCountry: sender.country,
        recipientName: recipient.name,
        recipientFirstName: recipient.firstName,
        recipientLastName: recipient.lastName,
        recipientEmail: recipient.email,
        recipientPhone: recipient.phone,
        recipientAddressLine1: recipient.addressLine1,
        recipientAddressLine2: recipient.addressLine2,
        recipientAddressLine3: recipient.addressLine3,
        recipientPostalCode: recipient.postalCode,
        recipientCity: recipient.city,
        recipientCountry: recipient.country,
        deliveryRelayLocation: quote.relayLocation,
        weightGrams: quote.weightGrams,
        packageCount: 1,
        declaredValueMinorAmount: reservation.merchandiseSubtotalMinorAmount,
        declaredCurrency: "EUR",
        metadata: {
            commerceOrderId: orderPublicId,
            financialTermsHash: reservation.financialTermsHash,
            deliveryQuoteId: reservation.deliveryQuoteId,
            declaredValueMinorAmount: reservation.merchandiseSubtotalMinorAmount,
            declaredCurrency: "EUR",
        },
    };
}
