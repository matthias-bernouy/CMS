import {
    defaultCountry,
    defaultCurrency,
    sellerActivityDescription,
    stripeV2AccountIncludes,
} from "../../config/runtime.ts";
import { digest } from "../../shared/crypto.ts";
import { stripeV1, stripeV2 } from "../stripe-client.ts";
import type { StripeAccount, StripeAccountApiVersion } from "../types.ts";

export async function createConnectedAccount(options: {
    userId: string;
    country: string;
    email: string;
    displayName?: string | null;
}): Promise<StripeAccount> {
    return await stripeV2<StripeAccount>(
        "/core/accounts",
        {
            method: "POST",
            body: JSON.stringify({
                contact_email: options.email,
                display_name: options.displayName ?? options.email.split("@")[0],
                dashboard: "none",
                identity: {
                    country: options.country.toLowerCase(),
                    entity_type: "individual",
                },
                defaults: {
                    currency: defaultCurrency(),
                    profile: {
                        product_description: sellerActivityDescription(),
                    },
                    responsibilities: {
                        fees_collector: "application",
                        losses_collector: "application",
                    },
                },
                configuration: {
                    recipient: {
                        capabilities: {
                            stripe_balance: {
                                stripe_transfers: { requested: true },
                            },
                        },
                    },
                },
                include: stripeV2AccountIncludes,
            }),
        },
        { idempotencyKey: `cms_connect_account_v2_controlled_recipient_v2_${await digest(options.userId)}` },
    );
}

export async function createCustomConnectedAccount(userId: string, accountToken: string): Promise<StripeAccount> {
    return await stripeV2<StripeAccount>(
        "/core/accounts",
        {
            method: "POST",
            body: JSON.stringify({
                account_token: accountToken,
                dashboard: "none",
                identity: {
                    country: defaultCountry().toLowerCase(),
                },
                defaults: {
                    currency: defaultCurrency(),
                    profile: { product_description: sellerActivityDescription() },
                    responsibilities: {
                        fees_collector: "application",
                        losses_collector: "application",
                    },
                },
                configuration: {
                    recipient: {
                        capabilities: {
                            stripe_balance: {
                                stripe_transfers: { requested: true },
                            },
                        },
                    },
                },
                include: stripeV2AccountIncludes,
                metadata: { cms_user_id: userId },
            }),
        },
        { idempotencyKey: `cms_connect_custom_recipient_v2_${await digest(userId)}` },
    );
}

export async function updateCustomConnectedAccount(accountId: string, accountToken: string): Promise<StripeAccount> {
    return await stripeV2<StripeAccount>(
        `/core/accounts/${encodeURIComponent(accountId)}`,
        {
            method: "POST",
            body: JSON.stringify({
                account_token: accountToken,
            }),
        },
        { idempotencyKey: `cms_connect_custom_identity_${await digest(`${accountId}:${accountToken}`)}` },
    );
}

export async function retrieveAccount(accountId: string, apiVersion: StripeAccountApiVersion): Promise<StripeAccount> {
    if (apiVersion === "v1") {
        return await stripeV1<StripeAccount>(`/accounts/${encodeURIComponent(accountId)}`, { method: "GET" });
    }
    const include = new URLSearchParams();
    for (const [index, value] of stripeV2AccountIncludes.entries()) {
        include.set(`include[${index}]`, value);
    }
    return await stripeV2<StripeAccount>(`/core/accounts/${encodeURIComponent(accountId)}?${include.toString()}`, {
        method: "GET",
    });
}
