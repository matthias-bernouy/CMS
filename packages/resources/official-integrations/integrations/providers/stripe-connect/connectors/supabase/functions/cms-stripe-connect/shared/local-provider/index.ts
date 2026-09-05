import type { JsonRecord } from "../types.ts";
import { localAccount } from "./account.ts";
import { applyBalanceSettings, localBalanceSettings } from "./balance.ts";
import { formBody, stableSuffix } from "./common.ts";
import { localPaymentIntent, reviveLocalPaymentIntent } from "./payment.ts";

const accounts = new Map<string, JsonRecord>();
const paymentIntents = new Map<string, JsonRecord>();
const balanceSettings = new Map<string, JsonRecord>();

export function localStripeSimulationEnabled(
    secretKey: string,
    publishableKey: string,
    readEnv: (name: string) => string | undefined = (name) => Deno.env.get(name),
): boolean {
    return (
        readEnv("ULVIA_LOCAL_PROVIDER_SIMULATION") === "v1" &&
        localSupabaseRuntime(readEnv("SUPABASE_URL")) &&
        secretKey.startsWith("sk_test_ulvia_local_") &&
        publishableKey.startsWith("pk_test_ulvia_local_")
    );
}

function localSupabaseRuntime(value: string | undefined): boolean {
    try {
        const url = new URL(value ?? "");
        return (
            url.protocol === "http:" &&
            ["127.0.0.1", "localhost", "[::1]", "kong", "host.docker.internal"].includes(url.hostname.toLowerCase())
        );
    } catch {
        return false;
    }
}

export async function simulateLocalStripeRequest(
    version: "v1" | "v2",
    path: string,
    init: RequestInit,
    idempotencyKey?: string,
): Promise<JsonRecord> {
    const pathname = path.split("?", 1)[0] ?? path;
    if (version === "v2" && pathname === "/core/accounts" && init.method === "POST") {
        const input = await jsonBody(init);
        const id = `acct_local_${stableSuffix(idempotencyKey ?? JSON.stringify(input))}`;
        const account = localAccount(id, input);
        accounts.set(id, account);
        return account;
    }
    if (version === "v2" && pathname.startsWith("/core/accounts/")) {
        const id = decodeURIComponent(pathname.slice("/core/accounts/".length));
        const current = accounts.get(id) ?? localAccount(id, {});
        accounts.set(id, current);
        return current;
    }
    if (version === "v1" && pathname === "/account_sessions" && init.method === "POST") {
        const account = formBody(init).get("account") ?? "acct_local_missing";
        return {
            account,
            client_secret: `as_local_${stableSuffix(account)}_secret`,
            expires_at: Math.floor(Date.now() / 1_000) + 3_600,
        };
    }
    if (version === "v1" && pathname === "/balance") {
        return {
            livemode: false,
            available: [{ currency: "eur", amount: 12_500 }],
            pending: [{ currency: "eur", amount: 2_500 }],
            instant_available: [],
            connect_reserved: [{ currency: "eur", amount: 500 }],
        };
    }
    if (version === "v1" && pathname === "/balance_settings") {
        const scope = new Headers(init.headers).get("stripe-account") ?? "platform";
        const current = balanceSettings.get(scope) ?? localBalanceSettings();
        if (init.method !== "POST") {
            return current;
        }
        const updated = applyBalanceSettings(current, formBody(init));
        balanceSettings.set(scope, updated);
        return updated;
    }
    if (version === "v1" && pathname === "/payment_intents" && init.method === "POST") {
        const intent = localPaymentIntent(formBody(init));
        paymentIntents.set(String(intent.id), intent);
        return intent;
    }
    if (version === "v1" && pathname.startsWith("/payment_intents/")) {
        const id = decodeURIComponent(pathname.slice("/payment_intents/".length).split("/", 1)[0] ?? "");
        const intent = paymentIntents.get(id) ?? reviveLocalPaymentIntent(id);
        if (intent) {
            paymentIntents.set(id, intent);
            return intent;
        }
    }
    if (version === "v1" && init.method === "GET" && ["/disputes", "/refunds", "/transfers"].includes(pathname)) {
        return {
            object: "list",
            data: [],
            has_more: false,
            url: `/v1${pathname}`,
        };
    }
    throw new Error(`Unsupported local Stripe simulation route: ${version.toUpperCase()} ${init.method} ${path}`);
}

async function jsonBody(init: RequestInit): Promise<JsonRecord> {
    const value = init.body ? JSON.parse(String(init.body)) : {};
    return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}
