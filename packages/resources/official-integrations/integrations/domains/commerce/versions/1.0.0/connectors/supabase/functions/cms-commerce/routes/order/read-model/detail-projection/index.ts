import type { PublicOrderMetadataDefinition } from "../../../../core/order-metadata.ts";
import { withPublicOrderMetadata } from "../../../../core/order-metadata.ts";
import type { JsonRecord } from "../../../../core/types.ts";
import { projectSale, safeOptional, safeRecord } from "../projections.ts";
import {
    adminEventFields,
    authorizationFields,
    claimFields,
    financialFields,
    fulfillmentFields,
    lineFields,
    operationFields,
    orderFields,
    publicEventFields,
    sellerFields,
    sellerFinancialFields,
    sellerFulfillmentFields,
    sellerLineFields,
    sellerOperationFields,
    sellerSettlementFields,
    settlementFields,
} from "./fields.ts";

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
