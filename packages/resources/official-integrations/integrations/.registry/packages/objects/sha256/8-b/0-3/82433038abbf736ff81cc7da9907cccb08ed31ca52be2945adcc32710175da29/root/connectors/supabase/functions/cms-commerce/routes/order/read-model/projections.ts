import { camelize } from "../../../core/records.ts";
import type { JsonRecord } from "../../../core/types.ts";
import { type PublicOrderMetadataDefinition, withPublicOrderMetadata } from "../../../core/order-metadata.ts";

export const orderFields = [
    "id",
    "publicId",
    "orderNumber",
    "checkoutGroupId",
    "sellerId",
    "buyerCmsUserId",
    "status",
    "currency",
    "subtotalAmount",
    "shippingAmount",
    "deliveryQuotedAt",
    "totalAmount",
    "shippingAddress",
    "billingAddress",
    "metadata",
    "idempotencyKey",
    "archivedAt",
    "version",
    "createdAt",
    "updatedAt",
] as const;
export const saleFields = [
    "id",
    "publicId",
    "orderNumber",
    "checkoutGroupId",
    "status",
    "currency",
    "subtotalAmount",
    "shippingAmount",
    "deliveryQuotedAt",
    "totalAmount",
    "metadata",
    "version",
    "createdAt",
    "updatedAt",
] as const;
const orderListFields = [
    "id",
    "publicId",
    "orderNumber",
    "lineSummary",
    "checkoutGroupId",
    "sellerId",
    "buyerCmsUserId",
    "status",
    "currency",
    "subtotalAmount",
    "shippingAmount",
    "deliveryQuotedAt",
    "totalAmount",
    "shippingAddress",
    "billingAddress",
    "metadata",
    "idempotencyKey",
    "archivedAt",
    "version",
    "createdAt",
    "updatedAt",
] as const;
const saleListFields = [
    "id",
    "publicId",
    "orderNumber",
    "lineSummary",
    "checkoutGroupId",
    "status",
    "currency",
    "subtotalAmount",
    "shippingAmount",
    "deliveryQuotedAt",
    "totalAmount",
    "metadata",
    "version",
    "createdAt",
    "updatedAt",
] as const;
const operationListFields = [
    "orderId",
    "paymentStatus",
    "fulfillmentStatus",
    "settlementStatus",
    "claimStatus",
    "totalRefundRequestedAmount",
    "updatedAt",
] as const;

export function projectOrderListItem(
    row: JsonRecord,
    operation: JsonRecord | null,
    definitions: readonly PublicOrderMetadataDefinition[],
    publicMetadata: boolean,
): JsonRecord {
    const item = {
        ...safeRecord(row, orderListFields),
        operation: safeOptional(operation, operationListFields),
    };
    return publicMetadata ? withPublicOrderMetadata(item, definitions) : item;
}

export function projectSale(row: JsonRecord, definitions: readonly PublicOrderMetadataDefinition[]): JsonRecord {
    return withPublicOrderMetadata(safeRecord(row, saleFields), definitions);
}

export function projectSaleListItem(
    row: JsonRecord,
    definitions: readonly PublicOrderMetadataDefinition[],
): JsonRecord {
    return withPublicOrderMetadata(safeRecord(row, saleListFields), definitions);
}

export function safeRecord(row: JsonRecord, fields: readonly string[]): JsonRecord {
    const value = camelize(row) as JsonRecord;
    return Object.fromEntries(
        fields.flatMap((field) => (Object.prototype.hasOwnProperty.call(value, field) ? [[field, value[field]]] : [])),
    );
}

export function safeOptional(row: JsonRecord | null, fields: readonly string[]): JsonRecord | null {
    return row ? safeRecord(row, fields) : null;
}
