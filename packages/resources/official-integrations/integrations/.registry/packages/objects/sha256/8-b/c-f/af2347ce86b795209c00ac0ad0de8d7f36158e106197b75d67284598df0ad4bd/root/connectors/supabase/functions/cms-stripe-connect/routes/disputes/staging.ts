import { getRowByField, insertRow, updateRow } from "../../db/postgrest.ts";
import { insertPaymentEvent } from "../../db/repositories/events-exceptions.ts";
import type { StripeDisputeRow } from "../../db/records/disputes.ts";
import { requireDashboardAdmin } from "../../http/auth.ts";
import { assertAllowedKeys, readJsonObject, requiredString } from "../../http/body/index.ts";
import { HttpError } from "../../http/errors.ts";
import { json } from "../../http/responses.ts";
import { isRecord, jsonEqual } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";

type DisputeStagingRouteDependencies = {
    requiredDispute(disputeId: string): Promise<StripeDisputeRow>;
    terminalDisputeStatus(status: string): boolean;
};

export function createStageStripeDisputeEvidence({
    requiredDispute,
    terminalDisputeStatus,
}: DisputeStagingRouteDependencies): (request: Request) => Promise<Response> {
    return async function stageStripeDisputeEvidence(request) {
        const { userId, actorKind } = requireDashboardAdmin(request);
        const body = await readJsonObject(request);
        assertAllowedKeys(body, [
            "disputeId",
            "evidenceOperationId",
            "evidence",
            "evidenceText",
            "customerCommunicationFileId",
            "shippingDocumentationFileId",
            "shippingTrackingNumber",
            "shippingDate",
            "receiptFileId",
            "productDescription",
            "customerName",
            "customerEmailAddress",
        ]);
        const disputeId = requiredString(body, "disputeId", 200);
        const evidenceOperationId = requiredString(body, "evidenceOperationId", 200);
        const dispute = await requiredDispute(disputeId);
        if (terminalDisputeStatus(dispute.status)) {
            throw new HttpError(409, "Stripe dispute is already terminal");
        }
        const evidence = sanitizeDisputeEvidence(flattenDisputeEvidence(body));
        let row = await getRowByField<JsonRecord>(
            "stripe_dispute_evidence",
            "evidence_operation_id",
            evidenceOperationId,
            "*",
        );
        if (row) {
            if (Number(row.dispute_id) !== dispute.id || !jsonEqual(row.evidence, evidence)) {
                throw new HttpError(409, "dispute evidence replay mismatch");
            }
        } else {
            row = await insertRow<JsonRecord>("stripe_dispute_evidence", "*", {
                dispute_id: dispute.id,
                evidence_operation_id: evidenceOperationId,
                evidence,
                staged_by: userId,
            });
            await updateRow("stripe_disputes", dispute.id, { evidence_status: "staged" });
            await insertPaymentEvent(dispute.payment_id, "stripe_dispute_evidence_staged", actorKind, userId, {
                disputeId,
                evidenceOperationId,
            });
        }
        return json({ evidenceOperationId, disputeId, status: "staged", stagedAt: row.staged_at });
    };
}

function sanitizeDisputeEvidence(value: unknown): JsonRecord {
    if (!isRecord(value)) {
        throw new HttpError(400, "evidence must be an object");
    }
    const allowed = new Set([
        "access_activity_log",
        "billing_address",
        "cancellation_policy",
        "cancellation_policy_disclosure",
        "cancellation_rebuttal",
        "customer_communication",
        "customer_email_address",
        "customer_name",
        "customer_purchase_ip",
        "customer_signature",
        "duplicate_charge_documentation",
        "duplicate_charge_explanation",
        "duplicate_charge_id",
        "product_description",
        "receipt",
        "refund_policy",
        "refund_policy_disclosure",
        "refund_refusal_explanation",
        "service_date",
        "service_documentation",
        "shipping_address",
        "shipping_carrier",
        "shipping_date",
        "shipping_documentation",
        "shipping_tracking_number",
        "uncategorized_file",
        "uncategorized_text",
    ]);
    const sanitized: JsonRecord = {};
    for (const [key, entry] of Object.entries(value)) {
        if (!allowed.has(key)) {
            throw new HttpError(400, `unsupported Stripe evidence field: ${key}`);
        }
        if (typeof entry !== "string" || !entry.trim() || entry.length > 20_000) {
            throw new HttpError(400, `Stripe evidence field ${key} must be a non-empty string`);
        }
        if (
            [
                "customer_communication",
                "customer_signature",
                "duplicate_charge_documentation",
                "receipt",
                "service_documentation",
                "shipping_documentation",
                "uncategorized_file",
            ].includes(key) &&
            !entry.startsWith("file_")
        ) {
            throw new HttpError(400, `Stripe evidence field ${key} requires a Stripe file id`);
        }
        sanitized[key] = entry.trim();
    }
    if (!Object.keys(sanitized).length) {
        throw new HttpError(400, "at least one evidence field is required");
    }
    return sanitized;
}

function flattenDisputeEvidence(body: JsonRecord): JsonRecord {
    const evidence = isRecord(body.evidence) ? { ...body.evidence } : {};
    const mappings: Array<[string, string]> = [
        ["evidenceText", "uncategorized_text"],
        ["customerCommunicationFileId", "customer_communication"],
        ["shippingDocumentationFileId", "shipping_documentation"],
        ["shippingTrackingNumber", "shipping_tracking_number"],
        ["shippingDate", "shipping_date"],
        ["receiptFileId", "receipt"],
        ["productDescription", "product_description"],
        ["customerName", "customer_name"],
        ["customerEmailAddress", "customer_email_address"],
    ];
    for (const [input, provider] of mappings) {
        if (body[input] !== undefined && body[input] !== null && body[input] !== "") {
            evidence[provider] = body[input];
        }
    }
    return evidence;
}
