import { digest } from "../../shared/crypto.ts";
import type { JsonRecord } from "../../shared/types.ts";
import { stripeV1, stripeV2 } from "../stripe-client.ts";
import type { StripeAccountApiVersion, StripeAccountSession } from "../types.ts";

export async function attachBankAccount(accountId: string, bankAccountToken: string): Promise<void> {
    const params = new URLSearchParams();
    params.set("external_account", bankAccountToken);
    params.set("default_for_currency", "true");
    await stripeV1<JsonRecord>(
        `/accounts/${encodeURIComponent(accountId)}/external_accounts`,
        {
            method: "POST",
            body: params,
        },
        { idempotencyKey: `cms_connect_bank_${await digest(`${accountId}:${bankAccountToken}`)}` },
    );
}

export async function createAccountLink(
    accountId: string,
    apiVersion: StripeAccountApiVersion,
    returnUrl: string,
    refreshUrl: string,
): Promise<JsonRecord> {
    if (apiVersion === "v2") {
        return await stripeV2<JsonRecord>("/core/account_links", {
            method: "POST",
            body: JSON.stringify({
                account: accountId,
                use_case: {
                    type: "account_onboarding",
                    account_onboarding: {
                        configurations: ["recipient"],
                        collection_options: {
                            fields: "currently_due",
                            future_requirements: "omit",
                        },
                        return_url: returnUrl,
                        refresh_url: refreshUrl,
                    },
                },
            }),
        });
    }

    const params = new URLSearchParams();
    params.set("account", accountId);
    params.set("return_url", returnUrl);
    params.set("refresh_url", refreshUrl);
    params.set("type", "account_onboarding");

    return await stripeV1<JsonRecord>("/account_links", {
        method: "POST",
        body: params,
    });
}

export async function createAccountSession(accountId: string): Promise<StripeAccountSession> {
    const params = new URLSearchParams();
    params.set("account", accountId);
    params.set("components[account_onboarding][enabled]", "true");

    return await stripeV1<StripeAccountSession>("/account_sessions", {
        method: "POST",
        body: params,
    });
}
