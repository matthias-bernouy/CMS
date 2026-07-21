import { jsonResponse, setRestResponder, type JsonRecord } from "../../../harness";
import { claimRow, financialTermsRow, orderRow, sellerRow } from "./raw";

export type ReturnAuthorizationResource = "claim" | "order" | "seller" | "financialTerms";

export type ReturnAuthorizationOptions = {
    claim?: JsonRecord | null;
    order?: JsonRecord | null;
    seller?: JsonRecord | null;
    financialTerms?: JsonRecord | null;
    failure?: ReturnAuthorizationResource;
    failureMessage?: string;
};

export function useReturnAuthorizationResponder(options: ReturnAuthorizationOptions = {}): void {
    setRestResponder((request) => {
        const path = new URL(request.url).pathname;
        if (path.endsWith("/rest/v1/rpc/get_claim_return_authorization_context")) {
            if (options.failure) {
                return upstreamFailure(options);
            }
            return jsonResponse(returnAuthorizationEnvelope(options));
        }

        const resource = resourceForPath(path);
        if (!resource) {
            throw new Error(`unexpected return-authorization request ${request.url}`);
        }
        if (options.failure === resource) {
            return upstreamFailure(options);
        }
        return jsonResponse([rowForResource(resource, options)].filter((value) => value !== null));
    });
}

export function returnAuthorizationEnvelope(options: ReturnAuthorizationOptions = {}): JsonRecord {
    const claim = option(options.claim, claimRow);
    if (!claim) {
        return { state: "not_found" };
    }
    return {
        state: "ok",
        claim,
        order: option(options.order, orderRow),
        seller: option(options.seller, sellerRow),
        financial_terms: option(options.financialTerms, financialTermsRow),
        future_private_context_field: "must-not-leak",
    };
}

function rowForResource(resource: ReturnAuthorizationResource, options: ReturnAuthorizationOptions): JsonRecord | null {
    if (resource === "claim") {
        return option(options.claim, claimRow);
    }
    if (resource === "order") {
        return option(options.order, orderRow);
    }
    if (resource === "seller") {
        return option(options.seller, sellerRow);
    }
    return option(options.financialTerms, financialTermsRow);
}

function resourceForPath(path: string): ReturnAuthorizationResource | null {
    if (path.endsWith("/rest/v1/marketplace_claims")) {
        return "claim";
    }
    if (path.endsWith("/rest/v1/orders")) {
        return "order";
    }
    if (path.endsWith("/rest/v1/sellers")) {
        return "seller";
    }
    if (path.endsWith("/rest/v1/order_financial_terms")) {
        return "financialTerms";
    }
    return null;
}

function upstreamFailure(options: ReturnAuthorizationOptions): Response {
    return jsonResponse(
        {
            message: options.failureMessage ?? `${options.failure} lookup unavailable`,
        },
        503,
    );
}

function option(value: JsonRecord | null | undefined, fallback: JsonRecord): JsonRecord | null {
    return value === undefined ? fallback : value;
}
