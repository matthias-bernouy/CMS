import {
    requiredEnv,
    stripeV1ApiBase,
    stripeV1ApiVersion,
    stripeV2ApiBase,
    stripeV2ApiVersion,
} from "../shared/runtime.ts";
import { ProviderHttpError } from "../http/errors.ts";
import { isRecord } from "../shared/data.ts";
import type { JsonRecord } from "../shared/types.ts";
import { localStripeSimulationEnabled, simulateLocalStripeRequest } from "../shared/local-provider/index.ts";

export async function stripeV1<T extends JsonRecord>(
    path: string,
    init: RequestInit,
    options: { idempotencyKey?: string } = {},
): Promise<T> {
    const secretKey = requiredEnv("STRIPE_SECRET_KEY");
    if (localStripeSimulationEnabled(secretKey, requiredEnv("STRIPE_PUBLISHABLE_KEY"))) {
        return (await simulateLocalStripeRequest("v1", path, init, options.idempotencyKey)) as T;
    }
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${secretKey}`);
    headers.set("stripe-version", stripeV1ApiVersion);
    if (init.body instanceof URLSearchParams) {
        headers.set("content-type", "application/x-www-form-urlencoded");
    }
    if (options.idempotencyKey) {
        headers.set("idempotency-key", options.idempotencyKey);
    }
    const response = await fetch(`${stripeV1ApiBase}${path}`, { ...init, headers });
    const data = await response.json().catch(() => null);
    if (response.ok && isRecord(data)) {
        return data as T;
    }
    throw stripeError(response.status, data);
}

export async function stripeV2<T extends JsonRecord>(
    path: string,
    init: RequestInit,
    options: { idempotencyKey?: string } = {},
): Promise<T> {
    const secretKey = requiredEnv("STRIPE_SECRET_KEY");
    if (localStripeSimulationEnabled(secretKey, requiredEnv("STRIPE_PUBLISHABLE_KEY"))) {
        return (await simulateLocalStripeRequest("v2", path, init, options.idempotencyKey)) as T;
    }
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${secretKey}`);
    headers.set("stripe-version", stripeV2ApiVersion);
    headers.set("content-type", "application/json");
    if (options.idempotencyKey) {
        headers.set("idempotency-key", options.idempotencyKey);
    }
    const response = await fetch(`${stripeV2ApiBase}${path}`, { ...init, headers });
    const data = await response.json().catch(() => null);
    if (response.ok && isRecord(data)) {
        return data as T;
    }
    throw stripeError(response.status, data);
}

function stripeError(status: number, data: unknown): ProviderHttpError {
    const error = isRecord(data) && isRecord(data.error) ? data.error : null;
    const message = error && typeof error.message === "string" ? error.message : `Stripe request failed (${status})`;
    return new ProviderHttpError(status, message);
}
