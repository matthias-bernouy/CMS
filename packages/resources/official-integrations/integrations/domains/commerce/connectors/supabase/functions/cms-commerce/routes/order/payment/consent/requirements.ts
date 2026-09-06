import { HttpError } from "../../../../core/errors.ts";
import { isRecord } from "../../../../core/records.ts";
import { rpc } from "../../../../core/rest.ts";
import type { JsonRecord } from "../../../../core/types.ts";
import { consentRequest } from "./client.ts";

export type BuyerConsentPolicy = {
    contextKey: string;
    receipt: JsonRecord | null;
    documents: JsonRecord[];
};

export async function buyerConsentContext(orderId: number, buyerId: string, provider: string): Promise<JsonRecord> {
    const result = await rpc("get_buyer_consent_context", {
        p_order_id: orderId,
        p_buyer_cms_user_id: buyerId,
        p_payment_provider: provider,
    });
    if (!isRecord(result) || typeof result.requiresConsent !== "boolean" || !Array.isArray(result.contexts)) {
        throw new HttpError(502, "invalid buyer consent context");
    }
    return result;
}

export async function buyerConsentPolicies(context: JsonRecord): Promise<BuyerConsentPolicy[]> {
    if (!context.requiresConsent) {
        return [];
    }
    const contexts = context.contexts as unknown[];
    if (contexts.length > 3 || contexts.some((key) => typeof key !== "string" || !/^[a-z_]+$/.test(key))) {
        throw new HttpError(502, "invalid buyer consent contexts");
    }
    return Promise.all(
        contexts.map(async (key) => {
            const contextKey = String(key);
            const previous = await consentRequest("/operations/receipt", {
                contextKey,
                operationKey: context.operationKey,
                cmsUserId: context.buyerCmsUserId,
            });
            if (isRecord(previous.receipt)) {
                return { contextKey, receipt: previous.receipt, documents: [] };
            }
            const requirements = await consentRequest(`/requirements?context=${encodeURIComponent(contextKey)}`);
            if (typeof requirements.enabled !== "boolean" || !Array.isArray(requirements.documents)) {
                throw new HttpError(503, "CONSENT_UNAVAILABLE");
            }
            const documents = requirements.documents.filter(isRecord);
            if (documents.length !== requirements.documents.length || (requirements.enabled && !documents.length)) {
                throw new HttpError(503, "CONSENT_UNAVAILABLE");
            }
            return { contextKey, receipt: null, documents: requirements.enabled ? documents : [] };
        }),
    );
}

export function publicConsentRequirements(policies: BuyerConsentPolicy[]): JsonRecord {
    const documents = policies.flatMap(({ contextKey, documents }) =>
        documents.map((document) => ({
            key: `${contextKey}.${String(document.documentKey)}`,
            label: document.label,
            consentText: document.consentText,
            pageUrl: isRecord(document.page) ? document.page.path : null,
            versionId: document.versionId,
            versionDate: document.versionDate,
        })),
    );
    return { enabled: documents.length > 0, documents };
}
