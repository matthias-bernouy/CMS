import { jsonResponse, setRestResponder } from "../../harness";

export const orderId = 42;
export const sellerCmsUserId = "seller-user";
export const publicId = "00000000-0000-4000-8000-000000000042";

export type SellerContextScenario = {
    label: string;
    route: string;
    rpc: string;
    database: Record<string, unknown>;
    expected: Record<string, unknown>;
};

export const scenarios: SellerContextScenario[] = [
    {
        label: "fulfillment",
        route: `/system/order/fulfillment/seller-context?orderId=${orderId}`,
        rpc: "get_order_fulfillment_seller_context",
        database: {
            id: orderId,
            public_id: publicId,
            order_number: "CO-42",
        },
        expected: {
            id: orderId,
            publicId,
            orderNumber: "CO-42",
        },
    },
    {
        label: "label",
        route: `/system/order/label/seller-context?orderId=${orderId}`,
        rpc: "get_order_label_seller_context",
        database: {
            public_id: publicId,
            allowed: true,
            seller_cms_user_id: sellerCmsUserId,
        },
        expected: {
            publicId,
            allowed: true,
            sellerCmsUserId,
        },
    },
    {
        label: "shipping actions",
        route: `/system/order/shipping/actions/seller-context?orderId=${orderId}`,
        rpc: "get_order_shipping_actions_seller_context",
        database: {
            id: orderId,
            public_id: publicId,
            order_number: "CO-42",
            seller_cms_user_id: sellerCmsUserId,
            order_status: "active",
            fulfillment_status: "label_created",
            settlement_status: "held",
            blocking_reason: null,
            review_reason: null,
            can_create_shipment: true,
            can_download_label: true,
            can_declare_handoff: true,
            requires_review: false,
        },
        expected: {
            id: orderId,
            publicId,
            orderNumber: "CO-42",
            sellerCmsUserId,
            orderStatus: "active",
            fulfillmentStatus: "label_created",
            settlementStatus: "held",
            blockingReason: null,
            reviewReason: null,
            canCreateShipment: true,
            canDownloadLabel: true,
            canDeclareHandoff: true,
            requiresReview: false,
        },
    },
    {
        label: "shipment creation",
        route: `/system/order/shipment-creation/seller-context?orderId=${orderId}`,
        rpc: "get_order_shipment_creation_seller_context",
        database: {
            id: orderId,
            public_id: publicId,
            allowed: true,
            seller_cms_user_id: sellerCmsUserId,
        },
        expected: {
            id: orderId,
            publicId,
            allowed: true,
            sellerId: sellerCmsUserId,
        },
    },
];

export function useRpcResult(value: unknown, status = 200): void {
    setRestResponder(() => jsonResponse(value, status));
}

export function ok(context: unknown): Record<string, unknown> {
    return { state: "ok", context };
}
