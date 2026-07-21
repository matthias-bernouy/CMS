import { makeEndpointUrn, makeSourceUrn, type Source } from "@bernouy/cms-sources";
import { computedUserHeader, number, object, text, userId } from "./shapes";

export function commerceSource(): Source {
    return {
        urn: makeSourceUrn("commerce"),
        endpoints: [
            {
                urn: makeEndpointUrn("commerce", "getOrderDeliverySetupContext"),
                method: "GET",
                targetUrl: "https://commerce.test/delivery-setup-context",
                headers: computedUserHeader(),
                input: {
                    params: [
                        {
                            name: "orderId",
                            in: "query",
                            schema: text(),
                        },
                    ],
                },
                output: [
                    {
                        status: "200",
                        body: {
                            ...object({
                                order: {
                                    ...object({
                                        publicId: text(),
                                        buyerCmsUserId: userId(),
                                        status: text(),
                                        version: number(),
                                    }),
                                    required: ["publicId", "buyerCmsUserId", "status", "version"],
                                },
                                authorization: {
                                    ...object(
                                        {
                                            buyerCmsUserId: userId(),
                                            status: text(),
                                            orderVersion: number(),
                                            sellerCmsUserId: userId(),
                                            currency: text(),
                                            merchandiseSubtotalMinorAmount: number(),
                                            shippingAddress: object(),
                                        },
                                        true,
                                    ),
                                    required: [
                                        "buyerCmsUserId",
                                        "status",
                                        "orderVersion",
                                        "sellerCmsUserId",
                                        "currency",
                                        "merchandiseSubtotalMinorAmount",
                                        "shippingAddress",
                                    ],
                                },
                            }),
                            required: ["order", "authorization"],
                        },
                    },
                ],
            },
            {
                urn: makeEndpointUrn("commerce", "getOrderDeliverySelectionContext"),
                method: "GET",
                targetUrl: "https://commerce.test/delivery-selection-context",
                headers: computedUserHeader(),
                input: {
                    params: [
                        {
                            name: "orderId",
                            in: "query",
                            schema: text(),
                        },
                    ],
                },
                output: [
                    {
                        status: "200",
                        body: {
                            ...object({
                                publicId: text(),
                                buyerCmsUserId: userId(),
                                deliveryQuoteId: text(true),
                            }),
                            required: ["publicId", "buyerCmsUserId", "deliveryQuoteId"],
                        },
                    },
                ],
            },
            {
                urn: makeEndpointUrn("commerce", "lockOrderFinancialTerms"),
                method: "POST",
                targetUrl: "https://commerce.test/financial-lock",
                headers: computedUserHeader(),
                input: {
                    body: {
                        ...object({
                            orderPublicId: text(),
                            deliveryQuoteId: text(),
                            shippingAmount: number(),
                            currency: text(),
                            expectedVersion: number(),
                        }),
                        required: ["orderPublicId", "deliveryQuoteId", "shippingAmount", "currency", "expectedVersion"],
                    },
                },
                output: [
                    {
                        status: "200",
                        body: object({
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
                        }),
                    },
                ],
            },
        ],
    };
}
