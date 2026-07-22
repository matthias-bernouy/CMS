import { makeEndpointUrn, type Source } from "@bernouy/cms-sources";
import { stripeConnectStatusShape as statusShape } from "./status";

export function stripeAccountEndpoints(): Source["endpoints"] {
    return [
        {
            urn: makeEndpointUrn("stripe-connect", "getConnectStatus"),
            method: "GET",
            targetUrl: "https://stripe.test/status",
            headers: [{ name: "x-user-id", source: { from: "computed", ref: "userID" } }],
            input: {
                params: [
                    { name: "marketplaceTermsVersion", in: "query", schema: { type: "string" } },
                    { name: "marketplaceTermsHash", in: "query", schema: { type: "string" } },
                ],
            },
            output: [
                { status: "200", body: statusShape },
                { status: "400", body: { type: "object" } },
                { status: "409", body: { type: "object" } },
            ],
        },
        {
            urn: makeEndpointUrn("stripe-connect", "enrollConnectSeller"),
            method: "POST",
            targetUrl: "https://stripe.test/enrollment",
            headers: [{ name: "x-user-id", source: { from: "computed", ref: "userID" } }],
            input: {
                body: {
                    type: "object",
                    properties: {
                        accountToken: { type: "string" },
                        contactEmail: { type: "string" },
                        marketplaceTermsAccepted: { type: "boolean" },
                        marketplaceTermsVersion: { type: "string" },
                        marketplaceTermsHash: { type: "string" },
                    },
                },
            },
            output: [
                { status: "200", body: statusShape },
                { status: "400", body: { type: "object" } },
                { status: "409", body: { type: "object" } },
            ],
        },
        {
            urn: makeEndpointUrn("stripe-connect", "getConnectClientConfig"),
            method: "GET",
            targetUrl: "https://stripe.test/config",
            headers: [{ name: "x-user-id", source: { from: "computed", ref: "userID" } }],
            input: { params: [] },
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: { publishableKey: { type: "string" } },
                        required: ["publishableKey"],
                    },
                },
            ],
        },
        {
            urn: makeEndpointUrn("stripe-connect", "checkSellerHeldPaymentEligibility"),
            method: "POST",
            access: { mode: "system" },
            targetUrl: "https://stripe.test/seller-eligibility",
            headers: [{ name: "x-user-id", source: { from: "computed", ref: "userID" } }],
            input: {
                body: {
                    type: "object",
                    properties: {
                        sellerUserId: { type: "string", semantic: { kind: "user-id", authority: "cms" } },
                        marketplaceTermsVersion: { type: "string" },
                        marketplaceTermsHash: { type: "string" },
                    },
                    required: ["sellerUserId", "marketplaceTermsVersion", "marketplaceTermsHash"],
                },
            },
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            eligible: { type: "boolean" },
                            reasonCode: { type: "string" },
                        },
                        required: ["eligible", "reasonCode"],
                    },
                },
            ],
        },
    ];
}
