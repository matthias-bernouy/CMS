export type JsonRecord = Record<string, unknown>;

export const buyerId = "buyer-123";
export const checkoutOrderId = "checkout-order-42";
export const claimOrderId = "claim-return:42";

export function checkoutBody(overrides: JsonRecord = {}): JsonRecord {
    return {
        requestKey: "save-request",
        externalOrderId: checkoutOrderId,
        orderVersion: 7,
        selectedForCmsUserId: buyerId,
        relayLocation: "fr-034439",
        country: "fr",
        postalCode: "75001",
        city: "Paris",
        currency: "EUR",
        merchandiseSubtotalMinorAmount: 12_345,
        recipientSnapshot: address("Alice Buyer", "+33600000000", "1 rue Buyer"),
        sellerFulfillmentSnapshot: address("Bob Seller", "+33611111111", "2 rue Seller"),
        ...overrides,
    };
}

export function claimBody(overrides: JsonRecord = {}): JsonRecord {
    return {
        externalOrderId: claimOrderId,
        relayLocation: "fr-034439",
        country: "fr",
        postalCode: "75001",
        city: "Paris",
        ...overrides,
    };
}

export function customSettingsRow(): JsonRecord {
    return {
        id: "default",
        default_weight_grams: 750,
        default_shipping_amount: 625,
        declared_currency: "EUR",
    };
}

export function relayPointResponse(): JsonRecord {
    return {
        Error: null,
        PRList: [
            {
                ID: "034439",
                Nom: "ARS INFORMATIQUE",
                Adresse1: "38 RUE MAUCONSEIL",
                Adresse2: "",
                CP: "75001",
                Ville: "PARIS",
                Pays: "FR",
                Lat: "48,8641433",
                Long: "2,3470309",
                Nature: "1",
                Available: true,
            },
        ],
    };
}

export const expectedCheckout = {
    quoteId: "mrq_907839f6e0813140eb2febf0a1d723d45aebd4766d20c9b21c35b28de909e2a7",
    externalOrderId: checkoutOrderId,
    orderVersion: 7,
    revision: 1,
    selectedForCmsUserId: buyerId,
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
    weightGrams: 750,
    shippingAmount: 625,
    currency: "eur",
    merchandiseSubtotalMinorAmount: 12_345,
    quotedAt: "2026-07-22T10:00:00.000Z",
    expiresAt: "2026-07-22T10:15:00.000Z",
};

export const expectedClaim = {
    externalOrderId: claimOrderId,
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
    weightGrams: 750,
    shippingAmount: 625,
    currency: "eur",
    selectedAt: "2026-07-22T10:00:00.000Z",
};

function address(name: string, phone: string, addressLine1: string): JsonRecord {
    return {
        name,
        phone,
        addressLine1,
        postalCode: "75001",
        city: "Paris",
        countryCode: "FR",
    };
}
