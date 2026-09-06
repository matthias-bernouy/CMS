import { cmsUserId } from "../../../core/auth.ts";
import { HttpError } from "../../../core/errors.ts";
import { json } from "../../../core/http.ts";
import { buyerConsentContext, buyerConsentPolicies, publicConsentRequirements } from "./consent/requirements.ts";
import { camelize, integer, isRecord } from "../../../core/records.ts";
import { rpc } from "../../../core/rest.ts";
import type { JsonRecord } from "../../../core/types.ts";
import { consentRequest } from "./consent/client.ts";

export async function getBuyerLegalRequirements(request: Request): Promise<Response> {
    const id = orderId(request);
    const buyerId = cmsUserId(request);
    const provider = paymentProvider(request);
    const context = await buyerConsentContext(id, buyerId, provider);
    return json(publicConsentRequirements(await buyerConsentPolicies(context)));
}

export async function getMyBuyerLegalAcceptanceAudit(request: Request): Promise<Response> {
    return buyerLegalAcceptanceAudit(request, cmsUserId(request));
}

export async function getAdminBuyerLegalAcceptanceAudit(request: Request): Promise<Response> {
    return buyerLegalAcceptanceAudit(request, null);
}

export function acceptedLegalDocumentVersionIds(value: unknown): string[] {
    if (value === undefined || value === null) {
        return [];
    }
    if (!Array.isArray(value) || value.length > 24) {
        throw new HttpError(400, "acceptedLegalDocumentVersionIds must be an array of at most 24 version ids");
    }
    const ids = value.map((entry) => {
        if (typeof entry !== "string" || !versionPattern.test(entry)) {
            throw new HttpError(409, "LEGAL_DOCUMENT_VERSION_CHANGED");
        }
        return entry.toLowerCase();
    });
    if (new Set(ids).size !== ids.length) {
        throw new HttpError(400, "acceptedLegalDocumentVersionIds must be unique");
    }
    return ids;
}

async function buyerLegalAcceptanceAudit(request: Request, buyerCmsUserId: string | null): Promise<Response> {
    const result = await rpc("get_buyer_legal_acceptance_audit", {
        p_order_id: orderId(request),
        p_buyer_cms_user_id: buyerCmsUserId,
    });
    const audit = camelize(result);
    if (!isRecord(audit)) {
        throw new HttpError(502, "invalid consent audit response");
    }
    const references = Array.isArray(audit.consentReferences) ? audit.consentReferences.filter(isRecord) : [];
    const receipts = await Promise.all(
        references.map(async (reference) => {
            const result = await consentRequest("/operations/receipt", {
                contextKey: reference.contextKey,
                operationKey: reference.operationKey,
                cmsUserId: audit.buyerCmsUserId,
            });
            const receipt = result.receipt;
            if (
                !isRecord(receipt) ||
                receipt.acceptanceId !== reference.acceptanceId ||
                !Array.isArray(receipt.documents)
            ) {
                throw new HttpError(503, "CONSENT_UNAVAILABLE");
            }
            return receipt.documents.filter(isRecord).map((document) => ({
                ...document,
                key: document.documentKey,
                acceptanceId: receipt.acceptanceId,
                contextKey: receipt.contextKey,
                acceptedAt: receipt.acceptedAt,
                correlationId: reference.correlationId,
            }));
        }),
    );
    const { consentReferences: _, ...publicAudit } = audit;
    return json({
        ...publicAudit,
        acceptances: [...(Array.isArray(audit.acceptances) ? audit.acceptances : []), ...receipts.flat()],
    });
}

function orderId(request: Request): number {
    const value = integer(new URL(request.url).searchParams.get("orderId"), "orderId", true)!;
    if (value <= 0) {
        throw new HttpError(400, "orderId must be positive");
    }
    return value;
}

function paymentProvider(request: Request): string {
    const value = new URL(request.url).searchParams.get("paymentProvider")?.trim() ?? "";
    if (!providerPattern.test(value)) {
        throw new HttpError(400, "paymentProvider is invalid");
    }
    return value;
}

const versionPattern = /^[a-f0-9]{64}$/;
const providerPattern = /^[a-z][a-z0-9_.-]{1,79}$/;
