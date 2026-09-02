import { json } from "../../core/http.ts";

const seeds = [
    [
        "commerce.order.paid",
        "Purchase confirmation",
        "Payment recorded for order {{ order.number }}",
        "Your payment was accepted for this order.",
    ],
    [
        "commerce.order.cancelled",
        "Order cancelled",
        "Order {{ order.number }} cancelled",
        "Your order has been cancelled.",
    ],
    [
        "commerce.order.refunded",
        "Order refunded",
        "Refund completed for order {{ order.number }}",
        "Your refund has been completed.",
    ],
    [
        "commerce.order.fulfillment.carrier_accepted",
        "Carrier accepted",
        "The carrier has your order {{ order.number }}",
        "The carrier has accepted your parcel.",
    ],
    [
        "commerce.order.fulfillment.in_transit",
        "In transit",
        "Order {{ order.number }} is in transit",
        "Your parcel is now in transit.",
    ],
    [
        "commerce.order.fulfillment.available_for_pickup",
        "Available for pickup",
        "Order {{ order.number }} is ready for pickup",
        "Your parcel is available for pickup.",
    ],
    [
        "commerce.order.fulfillment.collected_by_recipient",
        "Parcel collected",
        "Order {{ order.number }} was collected",
        "Your parcel was collected successfully.",
    ],
    [
        "commerce.order.fulfillment.incident",
        "Delivery incident",
        "Delivery incident for order {{ order.number }}",
        "The carrier reported an incident affecting your delivery.",
    ],
    [
        "commerce.order.fulfillment.lost",
        "Parcel lost",
        "Parcel reported lost for order {{ order.number }}",
        "The carrier reported your parcel as lost.",
    ],
    [
        "commerce.order.fulfillment.returning_to_sender",
        "Returning to sender",
        "Order {{ order.number }} is returning to the sender",
        "Your parcel is being returned to the sender.",
    ],
    [
        "commerce.order.fulfillment.returned_to_sender",
        "Returned to sender",
        "Order {{ order.number }} was returned to the sender",
        "Your parcel has been returned to the sender.",
    ],
] as const;

const sampleData = {
    recipient: { email: "buyer@example.com" },
    order: {
        id: "00000000-0000-0000-0000-000000000001",
        number: "ORD-1001",
        status: "active",
        currency: "EUR",
        totalAmountMinor: 12500,
    },
    delivery: { status: "in_transit", label: "Parcel in transit" },
    action: { path: "/account/purchases?order=example" },
};

export function notificationTemplates(): Response {
    return json({
        contractVersion: 1,
        items: [
            {
                key: "commerce.price_agreement.accepted",
                name: "Commerce - Offer accepted",
                status: "active",
                subject: "Your offer for {{ offer.title }} was accepted",
                htmlBody:
                    '<p>Your offer was accepted.</p><p><strong>{{ agreement.subtotalAmountFormatted }}</strong></p><p><a href="{{ action.path }}">Proceed to payment</a></p>',
                textBody: "Your offer for {{ offer.title }} was accepted.\n\nProceed to payment: {{ action.path }}",
                requiredTokens: [
                    {
                        name: "offer.title",
                        description: "Accepted offer title",
                        sample: "Racket",
                    },
                    {
                        name: "agreement.subtotalAmountFormatted",
                        description: "Human-readable negotiated checkout amount",
                        sample: "120.00 EUR",
                    },
                    {
                        name: "action.path",
                        description: "Checkout path containing the price agreement identifier",
                        sample: "/checkout?agreementId=00000000-0000-0000-0000-000000000002",
                    },
                ],
                sampleData: {
                    recipient: { email: "buyer@example.com" },
                    agreement: {
                        id: "00000000-0000-0000-0000-000000000002",
                        version: 2,
                        status: "active",
                        subtotalAmountMinor: 12000,
                        subtotalAmountFormatted: "120.00 EUR",
                        currency: "EUR",
                    },
                    offer: { id: 91, slug: "racket", title: "Racket" },
                    order: {
                        id: "00000000-0000-0000-0000-000000000001",
                        number: "NEGOTIATED-ORDER-PENDING",
                        status: "awaiting_checkout",
                        currency: "EUR",
                        totalAmountMinor: 12000,
                    },
                    delivery: { status: "accepted", label: "Offer accepted" },
                    action: {
                        path: "/checkout?agreementId=00000000-0000-0000-0000-000000000002",
                    },
                },
                metadata: { owner: "commerce", contractVersion: 1 },
            },
            ...seeds.map(([key, label, subject, introduction]) => ({
                key,
                name: `Commerce - ${label}`,
                status: "active",
                subject,
                htmlBody: `<p>${introduction}</p><p>Order <strong>{{ order.number }}</strong></p><p>Current status: <strong>{{ order.status }}</strong></p>`,
                textBody: `${introduction}\n\nOrder {{ order.number }}\nCurrent status: {{ order.status }}`,
                requiredTokens: [
                    {
                        name: "order.number",
                        description: "Commerce order number",
                        sample: "ORD-1001",
                    },
                    {
                        name: "order.status",
                        description: "Current Commerce order status",
                        sample: "active",
                    },
                ],
                sampleData,
                metadata: { owner: "commerce", contractVersion: 1 },
            })),
        ],
    });
}
