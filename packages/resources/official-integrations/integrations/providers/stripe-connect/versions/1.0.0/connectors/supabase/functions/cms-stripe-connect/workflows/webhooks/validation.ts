import { HttpError } from "../../http/errors.ts";
import { bytesToHex, safeEqual } from "../../shared/crypto.ts";
import { requiredEnv, stripeWebhookToleranceSeconds } from "../../shared/runtime.ts";
import type { JsonRecord } from "../../shared/types.ts";

type StripeWebhookSecretName =
    | "STRIPE_WEBHOOK_SECRET"
    | "STRIPE_CONNECT_WEBHOOK_SECRET"
    | "STRIPE_CONNECT_V2_WEBHOOK_SECRET";

export async function verifyStripeWebhookSignature(
    rawBody: string,
    signatureHeader: string,
    secretName: StripeWebhookSecretName,
): Promise<void> {
    const fields = signatureHeader.split(",").map((part) => part.trim().split("=", 2));
    const timestampText = fields.find(([key]) => key === "t")?.[1] ?? "";
    const signatures = fields.filter(([key]) => key === "v1").map(([, value]) => value ?? "");
    const timestamp = Number(timestampText);
    if (!Number.isSafeInteger(timestamp) || !signatures.length) {
        throw new HttpError(400, "invalid Stripe signature header");
    }
    if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > stripeWebhookToleranceSeconds) {
        throw new HttpError(400, "stale Stripe webhook signature");
    }
    const secret = requiredEnv(secretName);
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestampText}.${rawBody}`));
    const expected = bytesToHex(new Uint8Array(mac));
    if (!signatures.some((signature) => safeEqual(signature, expected))) {
        throw new HttpError(400, "invalid Stripe webhook signature");
    }
}

export function stripeEventCreatedAt(event: JsonRecord): string {
    if (Number.isSafeInteger(event.created)) {
        return new Date(Number(event.created) * 1000).toISOString();
    }
    if (typeof event.created === "string") {
        const timestamp = Date.parse(event.created);
        if (Number.isFinite(timestamp)) {
            return new Date(timestamp).toISOString();
        }
    }
    throw new HttpError(400, "Stripe event created timestamp is invalid");
}
