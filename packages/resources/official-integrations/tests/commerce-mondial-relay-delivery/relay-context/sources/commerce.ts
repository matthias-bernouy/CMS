import {
    makeEndpointUrn,
    makeSourceUrn,
    type Source,
} from "@bernouy/cms-sources";
import {
    array,
    computedUserHeader,
    number,
    object,
    text,
    userId,
} from "./shapes";

export function commerceSource(): Source {
    return {
        urn: makeSourceUrn("commerce"),
        endpoints: [{
            urn: makeEndpointUrn("commerce", "myOrder"),
            method: "GET",
            targetUrl: "https://commerce.test/order",
            headers: computedUserHeader(),
            input: {
                params: [{ name: "id", in: "query", schema: text() }],
            },
            output: [{ status: "200", body: object({
                publicId: text(),
                buyerCmsUserId: userId(),
                status: text(),
                version: number(),
                financialTerms: object({ deliveryQuoteId: text() }, true),
                shippingAddress: object(),
                lines: array(object()),
            }) }],
        }, {
            urn: makeEndpointUrn(
                "commerce",
                "getOrderDeliveryQuoteAuthorization",
            ),
            method: "GET",
            targetUrl: "https://commerce.test/quote-authorization",
            headers: computedUserHeader(),
            input: {
                params: [{
                    name: "orderPublicId",
                    in: "query",
                    required: true,
                    schema: text(),
                }],
            },
            output: [{ status: "200", body: {
                ...object({
                    orderId: number(),
                    orderPublicId: text(),
                    orderVersion: number(),
                    status: text(),
                    buyerCmsUserId: userId(),
                    sellerCmsUserId: userId(),
                    currency: text(),
                    merchandiseSubtotalMinorAmount: number(),
                    shippingAddress: object(),
                }),
                required: [
                    "orderId",
                    "orderPublicId",
                    "orderVersion",
                    "status",
                    "buyerCmsUserId",
                    "sellerCmsUserId",
                    "currency",
                    "merchandiseSubtotalMinorAmount",
                    "shippingAddress",
                ],
            } }],
        }, {
            urn: makeEndpointUrn("commerce", "lockOrderFinancialTerms"),
            method: "POST",
            targetUrl: "https://commerce.test/financial-lock",
            headers: computedUserHeader(),
            input: { body: {
                ...object({
                    orderPublicId: text(),
                    deliveryQuoteId: text(),
                    shippingAmount: number(),
                    currency: text(),
                    expectedVersion: number(),
                }),
                required: [
                    "orderPublicId",
                    "deliveryQuoteId",
                    "shippingAmount",
                    "currency",
                    "expectedVersion",
                ],
            } },
            output: [{ status: "200", body: object({
                orderId: number(),
                deliveryQuoteId: text(),
                merchandiseSubtotalAmount: number(),
                shippingAmount: number(),
                buyerProtectionFeeAmount: number(),
                buyerTotalAmount: number(),
                sellerTransferReleaseAmount: number(),
                currency: text(),
                financialTermsHash: text(),
                financialRevision: number(),
            }) }],
        }],
    };
}
