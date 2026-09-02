import { HttpError } from "../http/errors.ts";
import { isRecord, unique } from "./data.ts";

export const stripeV1ApiBase = "https://api.stripe.com/v1";
export const stripeV2ApiBase = "https://api.stripe.com/v2";
export const stripeV1ApiVersion = "2026-02-25.clover";
export const stripeV2ApiVersion = "2026-06-24.dahlia";
export const stripeWebhookToleranceSeconds = 300;
export const stripeWebhookMaximumBytes = 512 * 1024;
export const protectedPlatformPayoutInterval = "daily";
export const stripeV2AccountIncludes = ["configuration.recipient", "defaults", "identity", "requirements"] as const;
export const connectSchema = "stripe_connect";

export function defaultCountry(): string {
    const value = (Deno.env.get("STRIPE_CONNECT_DEFAULT_COUNTRY") ?? "FR").trim().toUpperCase();
    if (value !== "FR") {
        throw new HttpError(500, "STRIPE_CONNECT_DEFAULT_COUNTRY must be FR for this integration version");
    }
    return value;
}

export function defaultCurrency(): string {
    const value = (Deno.env.get("STRIPE_CONNECT_DEFAULT_CURRENCY") ?? "eur").trim().toLowerCase();
    if (value !== "eur") {
        throw new HttpError(500, "STRIPE_CONNECT_DEFAULT_CURRENCY must be EUR for this integration version");
    }
    return value;
}

export function sellerActivityDescription(): string {
    const value = (
        Deno.env.get("STRIPE_CONNECT_SELLER_ACTIVITY_DESCRIPTION") ??
        "Sale of second-hand goods between individuals through an online marketplace."
    ).trim();
    if (!value) {
        throw new HttpError(500, "STRIPE_CONNECT_SELLER_ACTIVITY_DESCRIPTION is invalid");
    }
    if (value.length > 400) {
        throw new HttpError(500, "STRIPE_CONNECT_SELLER_ACTIVITY_DESCRIPTION is too long");
    }
    return value;
}

export function serviceRoleKey(): string {
    const [key] = supabaseSecretKeys();
    if (key) {
        return key;
    }
    throw new HttpError(500, "missing Supabase secret key");
}

function supabaseSecretKeys(): string[] {
    const keys: string[] = [];
    const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (secretKeys) {
        try {
            const parsed = JSON.parse(secretKeys);
            if (isRecord(parsed)) {
                for (const value of Object.values(parsed)) {
                    if (typeof value === "string" && value) {
                        keys.push(value);
                    }
                }
            }
        } catch {
            throw new HttpError(500, "SUPABASE_SECRET_KEYS must be valid JSON");
        }
    }

    const modernSecretKey = Deno.env.get("SUPABASE_SECRET_KEY");
    if (modernSecretKey) {
        keys.push(modernSecretKey);
    }

    const legacyServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (legacyServiceRoleKey) {
        keys.push(legacyServiceRoleKey);
    }

    return unique(keys);
}

export function requiredEnv(name: string): string {
    const value = Deno.env.get(name);
    if (!value) {
        throw new HttpError(500, `missing ${name}`);
    }
    return value;
}

export function assertStripeKeyModeCoherence(): void {
    stripeLivemode();
}

export function stripeLivemode(): boolean {
    const secretKey = requiredEnv("STRIPE_SECRET_KEY");
    const publishableKey = requiredEnv("STRIPE_PUBLISHABLE_KEY");
    const secretMode = secretKey.startsWith("sk_live_") ? "live" : secretKey.startsWith("sk_test_") ? "test" : null;
    const publishableMode = publishableKey.startsWith("pk_live_")
        ? "live"
        : publishableKey.startsWith("pk_test_")
          ? "test"
          : null;
    if (!secretMode || !publishableMode || secretMode !== publishableMode) {
        throw new HttpError(500, "Stripe secret and publishable keys must use the same explicit test or live mode");
    }
    return secretMode === "live";
}
