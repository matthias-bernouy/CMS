import {
    expectedAdminList,
    expectedBuyerList,
    expectedSellerList,
} from "./expected-lists";
import {
    expectedAdminDetail,
    expectedBuyerDetail,
    expectedSellerDetail,
} from "./expected-details";

const buyerListFields = [
    "id", "publicId", "orderNumber", "checkoutGroupId", "sellerId", "buyerCmsUserId",
    "status", "currency", "subtotalAmount", "totalAmount", "shippingAddress",
    "billingAddress", "metadata", "metadataEntries", "idempotencyKey", "version",
    "createdAt", "updatedAt", "operation",
] as const;
const adminListFields = [
    "id", "publicId", "orderNumber", "checkoutGroupId", "sellerId", "buyerCmsUserId",
    "status", "currency", "subtotalAmount", "totalAmount", "shippingAddress",
    "billingAddress", "metadata", "idempotencyKey", "version", "createdAt", "updatedAt",
] as const;
const buyerDetailFields = [
    "id", "publicId", "orderNumber", "checkoutGroupId", "sellerId", "buyerCmsUserId",
    "status", "currency", "subtotalAmount", "shippingAmount", "deliveryQuotedAt",
    "totalAmount", "shippingAddress", "billingAddress", "metadata", "metadataEntries",
    "idempotencyKey", "version", "createdAt", "updatedAt", "lines", "events", "seller",
] as const;
const sellerDetailFields = [
    "id", "publicId", "orderNumber", "checkoutGroupId", "status", "currency",
    "subtotalAmount", "shippingAmount", "deliveryQuotedAt", "totalAmount", "metadata",
    "metadataEntries", "version", "createdAt", "updatedAt", "lines", "events",
] as const;
const financialFields = [
    "deliveryQuoteId", "merchandiseSubtotalAmount", "shippingAmount",
    "buyerProtectionFeeAmount", "buyerTotalAmount", "currency",
] as const;

export const expectedBuyerSourceList = {
    ...expectedBuyerList,
    items: expectedBuyerList.items.map(item => pick(item, buyerListFields)),
};
export const expectedSellerSourceList = expectedSellerList;
export const expectedAdminSourceList = {
    ...expectedAdminList,
    items: expectedAdminList.items.map(item => pick(item, adminListFields)),
};
export const expectedBuyerSourceDetail = {
    ...pick(expectedBuyerDetail, buyerDetailFields),
    financialTerms: pick(expectedBuyerDetail.financialTerms, financialFields),
};
export const expectedSellerSourceDetail = {
    ...pick(expectedSellerDetail, sellerDetailFields),
    financialTerms: expectedSellerDetail.financialTerms,
};
export const expectedAdminSourceDetail = pick(expectedAdminDetail, [
    ...adminListFields, "lines", "events", "seller",
] as const);

function pick<T extends object, K extends keyof T>(value: T, fields: readonly K[]): Pick<T, K> {
    return Object.fromEntries(fields.map(field => [field, value[field]])) as Pick<T, K>;
}
