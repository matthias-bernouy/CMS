import {
    makeEndpointUrn,
    type DataShape,
    type SourceEndpoint,
} from "@bernouy/cms-sources";
import {
    boolean,
    computedHeader,
    object,
    openObject,
    query,
    strings,
    text,
} from "./shapes";

const statusRequired = [
    "exists",
    "connected",
    "accountStatus",
    "termsStatus",
    "stripeTermsStatus",
    "marketplaceTermsStatus",
    "marketplaceTermsCurrentVersionAccepted",
    "enrollmentStatus",
    "onboardingStatus",
    "payoutsEnabled",
    "applicationControlledRecipient",
    "stripeTransfersStatus",
    "bankAccountStatus",
    "bankPayoutsStatus",
    "canAcceptHeldPayments",
    "canReceiveProtectedPayments",
    "payoutBankReady",
    "detailsSubmitted",
    "chargesEnabled",
    "currentlyDue",
    "eventuallyDue",
    "pastDue",
    "pendingVerification",
];

const enrollmentRequired = statusRequired.filter(name => ![
    "payoutsEnabled",
    "applicationControlledRecipient",
    "detailsSubmitted",
    "chargesEnabled",
    "currentlyDue",
    "eventuallyDue",
    "pastDue",
    "pendingVerification",
].includes(name));

export function stripeEndpoints(): SourceEndpoint[] {
    return [connectStatus(), enrollSeller()];
}

function connectStatus(): SourceEndpoint {
    return {
        urn: makeEndpointUrn("stripe-connect", "getConnectStatus"),
        method: "GET",
        access: { mode: "auth" },
        targetUrl: "https://stripe.test/status",
        headers: [computedHeader("x-user-id")],
        input: { params: [
            query("marketplaceTermsVersion"),
            query("marketplaceTermsHash"),
        ] },
        output: [
            {
                status: "200",
                body: object(statusProperties(), statusRequired),
            },
            { status: "400", body: openObject },
            { status: "409", body: openObject },
        ],
    };
}

function enrollSeller(): SourceEndpoint {
    return {
        urn: makeEndpointUrn("stripe-connect", "enrollConnectSeller"),
        method: "POST",
        access: { mode: "auth" },
        targetUrl: "https://stripe.test/enrollment",
        headers: [computedHeader("x-user-id")],
        input: { body: object({
            accountToken: text(),
            contactEmail: text(),
            marketplaceTermsAccepted: boolean(),
            marketplaceTermsVersion: text(),
            marketplaceTermsHash: text(),
        }) },
        output: [
            {
                status: "200",
                body: object(enrollmentProperties(), enrollmentRequired),
            },
            { status: "400", body: openObject },
            { status: "409", body: openObject },
        ],
    };
}

function statusProperties(): Record<string, DataShape> {
    return {
        exists: boolean(),
        userId: cmsUserId(),
        connected: boolean(),
        accountStatus: text(),
        termsStatus: text(),
        stripeTermsStatus: text(),
        marketplaceTermsStatus: text(),
        marketplaceTermsCurrentVersionAccepted: boolean(),
        marketplaceTermsAcceptedAt: text(true),
        enrollmentStatus: text(),
        onboardingStatus: text(),
        stripeAccountId: text(true),
        stripeAccountApiVersion: text(),
        payoutsEnabled: boolean(),
        riskStatus: text(),
        applicationControlledRecipient: boolean(),
        stripeTransfersStatus: text(),
        bankAccountStatus: text(),
        bankPayoutsStatus: text(),
        canAcceptHeldPayments: boolean(),
        payoutBankReady: boolean(),
        canReceiveProtectedPayments: boolean(),
        detailsSubmitted: boolean(),
        chargesEnabled: boolean(),
        currentlyDue: strings(),
        eventuallyDue: strings(),
        pastDue: strings(),
        pendingVerification: strings(),
    };
}

function enrollmentProperties(): Record<string, DataShape> {
    const properties = statusProperties();
    delete properties.riskStatus;
    delete properties.currentlyDue;
    delete properties.eventuallyDue;
    delete properties.pastDue;
    delete properties.pendingVerification;
    properties.stripeAccountId = text();
    properties.marketplaceTermsAcceptedAt = text();
    return properties;
}

function cmsUserId(): DataShape {
    return {
        type: "string",
        semantic: { kind: "user-id", authority: "cms" },
    };
}
