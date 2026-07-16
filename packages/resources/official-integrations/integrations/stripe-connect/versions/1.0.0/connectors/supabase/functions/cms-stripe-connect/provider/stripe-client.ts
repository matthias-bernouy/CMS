import {
    requiredEnv,
    stripeV1ApiBase,
    stripeV1ApiVersion,
    stripeV2ApiBase,
    stripeV2ApiVersion,
} from "../config/runtime.ts";
import { HttpError } from "../http/errors.ts";
import { isRecord } from "../shared/data.ts";
import type { JsonRecord } from "../shared/types.ts";

export async function stripeV1<T extends JsonRecord>(
    path: string,
    init: RequestInit,
    options: { idempotencyKey?: string } = {},
): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${requiredEnv("STRIPE_SECRET_KEY")}`);
    headers.set("stripe-version", stripeV1ApiVersion);
    if (init.body instanceof URLSearchParams) headers.set("content-type", "application/x-www-form-urlencoded");
    if (options.idempotencyKey) headers.set("idempotency-key", options.idempotencyKey);
    const response = await fetch(`${stripeV1ApiBase}${path}`, { ...init, headers });
    const data = await response.json().catch(() => null);
    if (response.ok && isRecord(data)) return data as T;
    throw stripeError(response.status, data);
}

export async function retrievePayout(payoutId: string, stripeAccountId: string): Promise<JsonRecord> {
    const headers = new Headers();
    if (stripeAccountId !== "platform") headers.set("stripe-account", stripeAccountId);
    return await stripeV1<JsonRecord>(`/payouts/${encodeURIComponent(payoutId)}`, {
        method: "GET",
        headers,
    });
}

export async function stripeV2<T extends JsonRecord>(
    path: string,
    init: RequestInit,
    options: { idempotencyKey?: string } = {},
): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${requiredEnv("STRIPE_SECRET_KEY")}`);
    headers.set("stripe-version", stripeV2ApiVersion);
    headers.set("content-type", "application/json");
    if (options.idempotencyKey) headers.set("idempotency-key", options.idempotencyKey);
    const response = await fetch(`${stripeV2ApiBase}${path}`, { ...init, headers });
    const data = await response.json().catch(() => null);
    if (response.ok && isRecord(data)) return data as T;
    throw stripeError(response.status, data);
}

function stripeError(status: number, data: unknown): HttpError {
    const error = isRecord(data) && isRecord(data.error) ? data.error : null;
    const message = error && typeof error.message === "string"
        ? error.message
        : `Stripe request failed (${status})`;
    return new HttpError(status >= 400 && status < 500 ? status : 502, message);
}
