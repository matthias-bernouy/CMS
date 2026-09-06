import { HttpError } from "../../../../core/errors.ts";
import type { JsonRecord } from "../../../../core/types.ts";
import { consentRequest } from "./client.ts";
import { buyerConsentContext, buyerConsentPolicies } from "./requirements.ts";

export async function verifiedBuyerConsentReceipts(
    orderId: number,
    buyerId: string,
    provider: string,
    acceptedVersionIds: string[],
): Promise<JsonRecord[]> {
    const context = await buyerConsentContext(orderId, buyerId, provider);
    if (!context.requiresConsent) {
        return [];
    }
    const policies = await buyerConsentPolicies(context);
    const required = policies.flatMap((policy) => policy.documents.map((document) => String(document.versionId)));
    const previouslyAccepted = policies.flatMap((policy) => {
        const documents = policy.receipt?.documents;
        return Array.isArray(documents) ? documents.map((document) => String(document.versionId)) : [];
    });
    const allowed = new Set([...required, ...previouslyAccepted]);
    if (required.some((id) => !acceptedVersionIds.includes(id)) || acceptedVersionIds.some((id) => !allowed.has(id))) {
        throw new HttpError(409, "LEGAL_DOCUMENT_VERSION_CHANGED");
    }
    return Promise.all(
        policies.map(async (policy) => {
            const metadata = {
                orderId: context.orderId,
                orderPublicId: context.orderPublicId,
                checkoutGroupId: context.checkoutGroupId,
                paymentProvider: context.paymentProvider,
            };
            const receipt = await consentRequest("/operations/accept", {
                contextKey: policy.contextKey,
                operationKey: context.operationKey,
                cmsUserId: buyerId,
                acceptedVersionIds: policy.documents.map((document) => document.versionId),
                metadata,
            });
            if (
                receipt.operationKey !== context.operationKey ||
                receipt.cmsUserId !== buyerId ||
                receipt.contextKey !== policy.contextKey
            ) {
                throw new HttpError(503, "CONSENT_UNAVAILABLE");
            }
            return receipt;
        }),
    );
}
