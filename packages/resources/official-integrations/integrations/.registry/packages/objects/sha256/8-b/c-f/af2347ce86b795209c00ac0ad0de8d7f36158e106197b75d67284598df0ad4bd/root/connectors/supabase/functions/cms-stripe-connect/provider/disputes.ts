import type { JsonRecord } from "../shared/types.ts";
import { stripeV1 } from "./stripe-client.ts";
import type { StripeDispute } from "./types.ts";

export async function uploadStripeDisputeEvidenceFile(form: FormData): Promise<JsonRecord> {
    return await stripeV1<JsonRecord>("/files", { method: "POST", body: form });
}

export async function closeStripeDispute(disputeId: string, idempotencyKey: string): Promise<StripeDispute> {
    return await stripeV1<StripeDispute>(
        `/disputes/${encodeURIComponent(disputeId)}/close`,
        {
            method: "POST",
            body: new URLSearchParams(),
        },
        { idempotencyKey },
    );
}

export async function listStripeDisputesByCharge(chargeId: string): Promise<JsonRecord> {
    const params = new URLSearchParams({ charge: chargeId, limit: "100" });
    return await stripeV1<JsonRecord>(`/disputes?${params.toString()}`, { method: "GET" });
}

export async function retrieveStripeDispute(disputeId: string): Promise<StripeDispute> {
    return await stripeV1<StripeDispute>(`/disputes/${encodeURIComponent(disputeId)}`, { method: "GET" });
}

export async function updateStripeDisputeEvidence(
    disputeId: string,
    evidence: JsonRecord,
    idempotencyKey: string,
): Promise<StripeDispute> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(evidence)) {
        params.set(`evidence[${key}]`, String(value));
    }
    params.set("submit", "true");
    return await stripeV1<StripeDispute>(
        `/disputes/${encodeURIComponent(disputeId)}`,
        {
            method: "POST",
            body: params,
        },
        { idempotencyKey },
    );
}
