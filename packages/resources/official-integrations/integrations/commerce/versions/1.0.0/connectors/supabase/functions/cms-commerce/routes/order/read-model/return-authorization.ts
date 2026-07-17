import { HttpError } from "../../../core/errors.ts";
import { isRecord } from "../../../core/records.ts";
import { rpc } from "../../../core/rest.ts";
import type { JsonRecord } from "../../../core/types.ts";
import { safeRecord } from "./projections.ts";

type ReturnAuthorizationContext = {
    claim: JsonRecord;
    order: JsonRecord | null;
    seller: JsonRecord | null;
    financialTerms: JsonRecord | null;
};

const functionName = "get_claim_return_authorization_context";
const claimFields = [
    "id", "publicId", "buyerCmsUserId", "status", "resolutionOutcome",
    "returnShipByAt", "returnDeliveryStatus", "returnRecipientHandoffAt", "version",
] as const;
const orderFields = ["id", "publicId", "orderNumber"] as const;
const sellerFields = ["id", "cmsUserId"] as const;
const financialFields = [
    "deliveryQuoteId", "merchandiseSubtotalAmount", "currency",
] as const;

export async function loadClaimReturnAuthorizationContext(
    claimId: number,
): Promise<ReturnAuthorizationContext> {
    const value = await rpc(functionName, { p_claim_id: claimId });
    if (!isRecord(value) || typeof value.state !== "string") throw invalidResponse();
    if (value.state === "not_found") throw new HttpError(404, "claim not found");
    if (value.state !== "ok") throw invalidResponse();
    return {
        claim: requiredRecord(value.claim, claimFields),
        order: optionalRecord(value.order, orderFields),
        seller: optionalRecord(value.seller, sellerFields),
        financialTerms: optionalRecord(value.financial_terms, financialFields),
    };
}

function optionalRecord(
    value: unknown,
    fields: readonly string[],
): JsonRecord | null {
    return value === null ? null : requiredRecord(value, fields);
}

function requiredRecord(value: unknown, fields: readonly string[]): JsonRecord {
    if (!isRecord(value)) throw invalidResponse();
    const projected = safeRecord(value, fields);
    if (Object.keys(projected).length !== fields.length) throw invalidResponse();
    return projected;
}

function invalidResponse(): HttpError {
    return new HttpError(502, `${functionName} returned an invalid response`);
}
