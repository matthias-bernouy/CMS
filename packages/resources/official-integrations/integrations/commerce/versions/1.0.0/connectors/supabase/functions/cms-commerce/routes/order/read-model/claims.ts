import { HttpError } from "../../../core/errors.ts";
import { json } from "../../../core/http.ts";
import { integer, isRecord } from "../../../core/records.ts";
import { rpc } from "../../../core/rest.ts";
import type { JsonRecord } from "../../../core/types.ts";
import { safeRecord } from "./projections.ts";

const functionName = "get_marketplace_claim_read_model";
const claimFields = [
    "id", "publicId", "orderId", "buyerCmsUserId", "sellerId", "reason", "status",
    "description", "buyerRequestedAmount", "resolutionOutcome",
    "resolutionBuyerRefundAmount", "resolutionSellerTransferAmount",
    "resolutionProtectionFeeRefundAmount", "decisionReason", "sellerResponseByAt",
    "returnShipByAt", "returnDeliveryStatus", "returnProviderReference",
    "returnCarrierAcceptedAt", "returnRecipientHandoffAt", "resolvedAt", "resolvedBy",
    "version", "createdAt", "updatedAt",
] as const;
const eventFields = [
    "id", "claimId", "eventType", "actorKind", "actorId", "message", "data", "createdAt",
] as const;
const evidenceFields = [
    "id", "claimId", "submittedByKind", "mimeType", "fileSize", "originalFilename",
    "sha256", "description", "metadata", "createdAt",
] as const;
const returnEventFields = [
    "id", "providerEventId", "providerReference", "normalizedStatus", "occurredAt", "createdAt",
] as const;

export async function getClaim(request: Request): Promise<Response> {
    const id = integer(new URL(request.url).searchParams.get("id"), "id", true)!;
    const result = await rpc(functionName, { p_claim_id: id });
    if (!isRecord(result) || typeof result.state !== "string") throw invalidResponse();
    if (result.state === "not_found") throw new HttpError(404, "claim not found");
    if (result.state !== "ok" || !isRecord(result.claim)) throw invalidResponse();
    return json({
        ...projectRequired(result.claim, claimFields),
        events: projectArray(result.events, eventFields),
        evidence: projectArray(result.evidence, evidenceFields),
        returnEvents: projectArray(result.return_events, returnEventFields),
    });
}

function projectArray(value: unknown, fields: readonly string[]): JsonRecord[] {
    if (!Array.isArray(value) || !value.every(isRecord)) throw invalidResponse();
    return value.map(row => projectRequired(row, fields));
}

function projectRequired(row: JsonRecord, fields: readonly string[]): JsonRecord {
    const projected = safeRecord(row, fields);
    if (Object.keys(projected).length !== fields.length) throw invalidResponse();
    return projected;
}

function invalidResponse(): HttpError {
    return new HttpError(502, `${functionName} returned an invalid response`);
}
