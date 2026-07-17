import {
    jsonResponse,
    setRestResponder,
    type JsonRecord,
} from "../../harness";

export const userId = "buyer-user-42";
export const orderId = 42;
export const setupRoute =
    `/system/order/delivery-setup-context?orderId=${orderId}`;
export const selectionRoute =
    `/system/order/delivery-selection-context?orderId=${orderId}`;

export const setupContext = {
    order: {
        public_id: "00000000-0000-4000-8000-000000000042",
        buyer_cms_user_id: userId,
        status: "awaiting_quote",
        version: 7,
        private_order_value: "must not leak",
    },
    authorization: {
        buyer_cms_user_id: userId,
        status: "awaiting_quote",
        order_version: 7,
        seller_cms_user_id: "seller-user-17",
        currency: "eur",
        merchandise_subtotal_minor_amount: 12_345,
        shipping_address: {
            line1: "1 Relay Street",
            postal_code: "75001",
            delivery_notes: { access_code: "A42" },
        },
        private_authorization_value: "must not leak",
    },
};

export const expectedSetupContext = {
    order: {
        publicId: "00000000-0000-4000-8000-000000000042",
        buyerCmsUserId: userId,
        status: "awaiting_quote",
        version: 7,
    },
    authorization: {
        buyerCmsUserId: userId,
        status: "awaiting_quote",
        orderVersion: 7,
        sellerCmsUserId: "seller-user-17",
        currency: "eur",
        merchandiseSubtotalMinorAmount: 12_345,
        shippingAddress: {
            line1: "1 Relay Street",
            postalCode: "75001",
            deliveryNotes: { accessCode: "A42" },
        },
    },
};

export const selectionContext = {
    public_id: "00000000-0000-4000-8000-000000000042",
    buyer_cms_user_id: userId,
    delivery_quote_id: "quote-42",
    private_financial_terms: { hash: "must not leak" },
};

export const expectedSelectionContext = {
    publicId: "00000000-0000-4000-8000-000000000042",
    buyerCmsUserId: userId,
    deliveryQuoteId: "quote-42",
};

export function useRpcResult(value: JsonRecord, status = 200): void {
    setRestResponder(() => jsonResponse(value, status));
}

export function ok(context: JsonRecord): JsonRecord {
    return {
        state: "ok",
        context,
        private_envelope_value: "must not leak",
    };
}
