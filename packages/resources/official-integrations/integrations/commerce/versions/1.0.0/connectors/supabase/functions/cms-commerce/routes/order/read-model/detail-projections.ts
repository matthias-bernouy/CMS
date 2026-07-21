import type { PublicOrderMetadataDefinition } from "../../../core/order-metadata.ts";
import { withPublicOrderMetadata } from "../../../core/order-metadata.ts";
import type { JsonRecord } from "../../../core/types.ts";
import { orderFields, projectSale, safeOptional, safeRecord } from "./projections.ts";

export type DetailBundle = {
    order: JsonRecord;
    lines: JsonRecord[];
    events: JsonRecord[];
    seller: JsonRecord | null;
    operation: JsonRecord | null;
    financialTerms: JsonRecord | null;
    fulfillment: JsonRecord | null;
    settlement: JsonRecord | null;
    claim: JsonRecord | null;
    authorization: JsonRecord | null;
    definitions: PublicOrderMetadataDefinition[];
};

const lineFields = [
    "id",
    "orderId",
    "offerId",
    "productId",
    "variantId",
    "acceptedProposalId",
    "title",
    "sku",
    "quantity",
    "unitAmount",
    "totalAmount",
    "productSnapshot",
    "variantSnapshot",
    "offerSnapshot",
    "sellerSnapshot",
    "createdAt",
] as const;
const sellerLineFields = lineFields.filter((field) => field !== "sellerSnapshot");
const publicEventFields = ["id", "orderId", "eventType", "previousStatus", "nextStatus", "createdAt"] as const;
const adminEventFields = [
    "id",
    "orderId",
    "eventType",
    "actorKind",
    "actorId",
    "previousStatus",
    "nextStatus",
    "message",
    "data",
    "createdAt",
] as const;
const sellerFields = ["id", "kind", "slug", "displayName"] as const;
const operationFields = [
    "orderId",
    "orderPublicId",
    "orderNumber",
    "buyerCmsUserId",
    "sellerId",
    "currency",
    "buyerTotalAmount",
    "sellerProceedsAmount",
    "platformRetainedAmount",
    "financialTermsHash",
    "paymentStatus",
    "fulfillmentStatus",
    "settlementStatus",
    "claimStatus",
    "totalRefundRequestedAmount",
    "releaseEligibleAt",
    "recipientHandoffAt",
    "recipientHandoffFirstObservedAt",
    "claimWindowStartedAt",
    "claimByAt",
    "updatedAt",
] as const;
const sellerOperationFields = [
    "orderId",
    "orderPublicId",
    "orderNumber",
    "currency",
    "paymentStatus",
    "fulfillmentStatus",
    "settlementStatus",
    "claimStatus",
    "recipientHandoffAt",
    "recipientHandoffFirstObservedAt",
    "claimWindowStartedAt",
    "claimByAt",
    "releaseEligibleAt",
    "updatedAt",
] as const;
const financialFields = [
    "orderId",
    "deliveryQuoteId",
    "merchandiseSubtotalAmount",
    "shippingAmount",
    "buyerProtectionFeeAmount",
    "sellerCommissionAmount",
    "buyerTotalAmount",
    "sellerProceedsAmount",
    "platformRetainedAmount",
    "currency",
    "financialTermsHash",
    "pricingLockedAt",
    "payByAt",
    "financialRevision",
] as const;
const sellerFinancialFields = [
    "orderId",
    "merchandiseSubtotalAmount",
    "shippingAmount",
    "sellerCommissionAmount",
    "platformShippingShareAmount",
    "sellerShippingShareAmount",
    "sellerProceedsAmount",
    "sellerTransferReleaseAmount",
    "sellerReserveLiabilityAmount",
    "currency",
    "pricingLockedAt",
    "payByAt",
    "financialRevision",
] as const;
const fulfillmentFields = [
    "orderId",
    "status",
    "sellerHandoffDeadline",
    "scanGraceDeadline",
    "carrierAcceptedAt",
    "arrivedAtPickupPointAt",
    "availableForPickupAt",
    "recipientHandoffAt",
    "recipientHandoffFirstObservedAt",
    "claimWindowStartedAt",
    "claimByAt",
    "releaseEligibleAt",
    "blockingReason",
    "version",
] as const;
const sellerFulfillmentFields = [
    "orderId",
    "status",
    "sellerHandoffDeadline",
    "scanGraceDeadline",
    "sellerHandoffDeclaredAt",
    "carrierAcceptedAt",
    "recipientHandoffAt",
    "recipientHandoffFirstObservedAt",
    "claimWindowStartedAt",
    "claimByAt",
    "releaseEligibleAt",
    "blockingReason",
    "version",
] as const;
const settlementFields = [
    "orderId",
    "status",
    "authorizedSellerAmount",
    "totalTransferredAmount",
    "totalReversedAmount",
    "totalRefundedAmount",
    "sellerReserveLiabilityRemainingAmount",
    "version",
] as const;
const sellerSettlementFields = settlementFields.filter((field) => field !== "totalRefundedAmount");
const claimFields = [
    "id",
    "publicId",
    "reason",
    "status",
    "sellerResponseByAt",
    "returnShipByAt",
    "resolvedAt",
    "version",
    "createdAt",
] as const;
const authorizationFields = [
    "allowed",
    "reason",
    "orderId",
    "orderPublicId",
    "sellerId",
    "currency",
    "paymentStatus",
    "fulfillmentStatus",
] as const;

export function projectOrderDetail(bundle: DetailBundle, publicMetadata: boolean): JsonRecord {
    const detail = {
        ...safeRecord(bundle.order, orderFields),
        lines: bundle.lines.map((line) => safeRecord(line, lineFields)),
        events: bundle.events.map((event) => safeRecord(event, publicMetadata ? publicEventFields : adminEventFields)),
        seller: safeOptional(bundle.seller, sellerFields),
        operation: safeOptional(bundle.operation, operationFields),
        financialTerms: safeOptional(bundle.financialTerms, financialFields),
        fulfillment: safeOptional(bundle.fulfillment, fulfillmentFields),
        settlement: safeOptional(bundle.settlement, settlementFields),
        claim: safeOptional(bundle.claim, claimFields),
    };
    return publicMetadata ? withPublicOrderMetadata(detail, bundle.definitions) : detail;
}

export function projectSaleDetail(bundle: DetailBundle): JsonRecord {
    return {
        ...projectSale(bundle.order, bundle.definitions),
        lines: bundle.lines.map((line) => safeRecord(line, sellerLineFields)),
        events: bundle.events.map((event) => safeRecord(event, publicEventFields)),
        operation: safeOptional(bundle.operation, sellerOperationFields),
        financialTerms: safeOptional(bundle.financialTerms, sellerFinancialFields),
        fulfillment: safeOptional(bundle.fulfillment, sellerFulfillmentFields),
        settlement: safeOptional(bundle.settlement, sellerSettlementFields),
        authorization: safeOptional(bundle.authorization, authorizationFields),
    };
}
