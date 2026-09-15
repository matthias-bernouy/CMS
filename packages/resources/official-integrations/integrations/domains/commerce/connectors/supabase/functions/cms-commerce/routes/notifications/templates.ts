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
    [
        "commerce.buyer.order.cancellation_started",
        "Cancellation started",
        "Cancellation started for order {{ order.number }}",
        "Your cancellation request is being processed.",
    ],
    [
        "commerce.buyer.order.refund_started",
        "Refund started",
        "Refund started for order {{ order.number }}",
        "Your refund is being processed.",
    ],
    [
        "commerce.buyer.order.refund_failed",
        "Refund needs attention",
        "Refund update for order {{ order.number }}",
        "Your refund needs manual attention. The support team has been notified.",
    ],
    [
        "commerce.buyer.claim.updated",
        "Claim updated",
        "Claim update for order {{ order.number }}",
        "There is an update on your claim.",
    ],
    [
        "commerce.buyer.order.fulfillment.pickup_expired",
        "Pickup period expired",
        "Pickup period expired for order {{ order.number }}",
        "The parcel pickup period has expired.",
    ],
    [
        "commerce.seller.sale.paid",
        "Sale paid",
        "Sale {{ order.number }} is ready to ship",
        "The buyer has paid. You can now prepare the parcel.",
    ],
    [
        "commerce.seller.sale.shipment_deadline_elapsed",
        "Shipment deadline elapsed",
        "Shipping deadline elapsed for sale {{ order.number }}",
        "The shipping deadline has elapsed. Open the sale to review the next step.",
    ],
    [
        "commerce.seller.sale.cancellation_started",
        "Sale cancellation started",
        "Cancellation started for sale {{ order.number }}",
        "The buyer started cancelling this sale.",
    ],
    [
        "commerce.seller.sale.refund_started",
        "Sale refund started",
        "Refund started for sale {{ order.number }}",
        "A refund request is being processed for this sale.",
    ],
    [
        "commerce.seller.sale.refunded",
        "Sale refunded",
        "Refund completed for sale {{ order.number }}",
        "The refund for this sale has been completed.",
    ],
    [
        "commerce.seller.claim.action_required",
        "Claim response required",
        "Respond to the claim for sale {{ order.number }}",
        "The buyer opened a claim and your response is required.",
    ],
    [
        "commerce.seller.claim.updated",
        "Claim updated",
        "Claim update for sale {{ order.number }}",
        "There is an update on the claim affecting this sale.",
    ],
    [
        "commerce.seller.sale.fulfillment.updated",
        "Shipment updated",
        "Shipment update for sale {{ order.number }}",
        "The parcel has an exceptional or terminal shipment update.",
    ],
    [
        "commerce.admin.action_required",
        "Commerce action required",
        "Action required for order {{ order.number }}",
        "A Commerce operation requires administrator review.",
    ],
    [
        "commerce.admin.financial_exception",
        "Financial exception",
        "Financial exception for order {{ order.number }}",
        "A high-priority financial exception requires administrator review.",
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
                        sample: "Sample product",
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
                    offer: { id: 91, slug: "sample-product", title: "Sample product" },
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
            {
                key: "commerce.seller.sale.shipment_reminder",
                name: "Commerce - Shipment reminder",
                status: "active",
                subject: "Ship sale {{ order.number }} before the deadline",
                htmlBody:
                    '<p>The parcel still needs to be handed to the carrier.</p><p>Deadline: <strong>{{ fulfillment.sellerHandoffDeadline }}</strong></p><p><a href="{{ action.path }}">Open the sale</a></p>',
                textBody:
                    "The parcel still needs to be handed to the carrier.\n\nDeadline: {{ fulfillment.sellerHandoffDeadline }}\nOpen the sale: {{ action.path }}",
                requiredTokens: [
                    {
                        name: "order.number",
                        description: "Commerce order number",
                        sample: "ORD-1001",
                    },
                    {
                        name: "fulfillment.sellerHandoffDeadline",
                        description: "Seller parcel handoff deadline",
                        sample: "2026-07-24T10:00:00.000Z",
                    },
                    {
                        name: "action.path",
                        description: "Seller sale detail path",
                        sample: "/account/sales?saleId=example",
                    },
                ],
                sampleData: {
                    ...sampleData,
                    recipient: { email: "seller@example.com", role: "seller" },
                    fulfillment: { sellerHandoffDeadline: "2026-07-24T10:00:00.000Z" },
                    action: { path: "/account/sales?saleId=example" },
                },
                metadata: { owner: "commerce", contractVersion: 1 },
            },
            ...seeds.map(([key, label, subject, introduction]) => ({
                key,
                name: `Commerce - ${label}`,
                status: "active",
                subject,
                htmlBody: `<p>${introduction}</p><p>Order <strong>{{ order.number }}</strong></p><p>Current status: <strong>{{ order.status }}</strong></p><p><a href="{{ action.path }}">View details</a></p>`,
                textBody: `${introduction}\n\nOrder {{ order.number }}\nCurrent status: {{ order.status }}\nView details: {{ action.path }}`,
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
                    {
                        name: "action.path",
                        description: "Role-appropriate order detail path",
                        sample: "/account/purchases?order=example",
                    },
                ],
                sampleData,
                metadata: { owner: "commerce", contractVersion: 1 },
            })),
        ],
    });
}
