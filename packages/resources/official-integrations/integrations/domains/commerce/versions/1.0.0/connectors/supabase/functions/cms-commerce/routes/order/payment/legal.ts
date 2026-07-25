import { cmsUserId } from "../../../core/auth.ts";
import { HttpError } from "../../../core/errors.ts";
import { json } from "../../../core/http.ts";
import {
    buyerLegalVerificationContext,
    fetchVerifiedBuyerLegalDocuments,
} from "../../configuration/buyer-legal/published-page-snapshot.ts";
import { camelize, integer } from "../../../core/records.ts";
import { rpc } from "../../../core/rest.ts";
import type { JsonRecord } from "../../../core/types.ts";

export async function getBuyerLegalRequirements(request: Request): Promise<Response> {
    const id = orderId(request);
    const buyerId = cmsUserId(request);
    const provider = paymentProvider(request);
    const verified = await verifiedLegalDocuments(id, buyerId, provider);
    const result = await rpc("get_fresh_buyer_legal_requirements", {
        p_order_id: id,
        p_buyer_cms_user_id: buyerId,
        p_payment_provider: provider,
        p_verified_documents: verified,
    });
    return json(camelize(result));
}

export async function verifiedLegalDocuments(
    orderId: number,
    buyerCmsUserId: string,
    paymentProvider: string | null,
): Promise<JsonRecord[]> {
    const rawContext = await rpc("get_buyer_legal_verification_context", {
        p_order_id: orderId,
        p_buyer_cms_user_id: buyerCmsUserId,
        p_payment_provider: paymentProvider,
    });
    return fetchVerifiedBuyerLegalDocuments(buyerLegalVerificationContext(rawContext));
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
    if (!Array.isArray(value) || value.length > 20) {
        throw new HttpError(400, "acceptedLegalDocumentVersionIds must be an array of at most 20 UUIDs");
    }
    const ids = value.map((entry) => {
        if (typeof entry !== "string" || !uuidPattern.test(entry)) {
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
    return json(camelize(result));
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

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const providerPattern = /^[a-z][a-z0-9_.-]{1,79}$/;
