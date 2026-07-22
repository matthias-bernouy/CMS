import { defaultCountry } from "../../shared/runtime.ts";
import { getAccountRow, updateAccountRow, upsertAccountRow } from "../../db/repositories/accounts.ts";
import type { ConnectAccountRow } from "../../db/records/accounts.ts";
import { publicAccount } from "../../domain/accounts/presentation.ts";
import { accountPatchFromStripe } from "../../domain/accounts/provider-projection.ts";
import {
    assertApplicationControlledRecipient,
    isApplicationCollectedAccount,
} from "../../domain/accounts/stripe-v2.ts";
import { assertOnlyKeys, optionalCountry, optionalEmail, optionalStripeToken, optionalText } from "../../http/body.ts";
import { HttpError } from "../../http/errors.ts";
import {
    createConnectedAccount,
    createCustomConnectedAccount,
    retrieveAccount,
    updateCustomConnectedAccount,
} from "../../provider/accounts/lifecycle.ts";
import { attachBankAccount } from "../../provider/accounts/onboarding.ts";
import type { StripeAccount, StripeAccountApiVersion } from "../../provider/types.ts";
import type { JsonRecord } from "../../shared/types.ts";

export async function ensureConnectedAccountForUser(
    userId: string,
    body: JsonRecord,
): Promise<{
    account: ConnectAccountRow;
    stripeAccountId: string;
    stripeAccountApiVersion: StripeAccountApiVersion;
}> {
    const email = optionalEmail(body, "email");
    const displayName = optionalText(body, "displayName", 200);
    const country = defaultCountry();
    const requestedCountry = optionalCountry(body, "country");
    if (requestedCountry && requestedCountry !== country) {
        throw new HttpError(400, `country must be ${country} for this integration version`);
    }

    let account = await getAccountRow(userId);
    let stripeAccountId = account?.stripe_account_id ?? null;
    let stripeAccountApiVersion: StripeAccountApiVersion = account?.stripe_account_api_version ?? "v1";
    if (!stripeAccountId) {
        if (!email) {
            throw new HttpError(400, "email is required to create a Stripe recipient account");
        }
        const stripeAccount = await createConnectedAccount({
            userId,
            country,
            email,
            displayName,
        });
        assertApplicationControlledRecipient(stripeAccount);
        stripeAccountId = stripeAccount.id;
        stripeAccountApiVersion = "v2";
        account = await upsertAccountRow({
            cms_user_id: userId,
            stripe_account_api_version: stripeAccountApiVersion,
            ...accountPatchFromStripe(stripeAccount, stripeAccountApiVersion),
        });
    } else {
        let stripeAccount = await retrieveAccount(stripeAccountId, stripeAccountApiVersion);
        if (stripeAccountApiVersion !== "v2" || !isApplicationCollectedAccount(stripeAccount)) {
            if (!email) {
                throw new HttpError(409, "email is required to replace a recipient account with unsafe payout access");
            }
            stripeAccount = await createConnectedAccount({
                userId,
                country,
                email,
                displayName,
            });
            assertApplicationControlledRecipient(stripeAccount);
            stripeAccountId = stripeAccount.id;
            stripeAccountApiVersion = "v2";
            account = await upsertAccountRow({
                cms_user_id: userId,
                stripe_account_api_version: stripeAccountApiVersion,
                ...accountPatchFromStripe(stripeAccount, stripeAccountApiVersion),
            });
        } else {
            account = await updateAccountRow(userId, accountPatchFromStripe(stripeAccount, stripeAccountApiVersion));
        }
    }

    if (!stripeAccountId) {
        throw new HttpError(502, "could not create connected account");
    }
    if (!account) {
        throw new HttpError(502, "could not store connected account");
    }
    return { account, stripeAccountId, stripeAccountApiVersion };
}

export async function submitCustomVerificationForUser(userId: string, body: JsonRecord): Promise<JsonRecord> {
    assertOnlyKeys(body, ["accountToken", "bankAccountToken", "contactEmail"]);
    const accountToken = optionalStripeToken(body, "accountToken", "accttok_");
    const bankAccountToken = optionalStripeToken(body, "bankAccountToken", "btok_");
    optionalEmail(body, "contactEmail");
    let row = await getAccountRow(userId);
    let stripeAccount: StripeAccount | null = null;

    if (row?.stripe_account_id) {
        stripeAccount = await retrieveAccount(row.stripe_account_id, row.stripe_account_api_version);
    }

    const replaceAccount =
        !row?.stripe_account_id ||
        row.stripe_account_api_version !== "v2" ||
        !isApplicationCollectedAccount(stripeAccount);

    if (replaceAccount) {
        if (!accountToken) {
            throw new HttpError(400, "accountToken is required for initial Stripe identity enrollment");
        }
        const currentPatch =
            stripeAccount && row ? accountPatchFromStripe(stripeAccount, row.stripe_account_api_version) : null;
        if (currentPatch?.payouts_enabled === true && currentPatch.details_submitted === true) {
            throw new HttpError(
                409,
                "A fully active legacy Stripe account cannot be replaced through seller verification",
            );
        }
        stripeAccount = await createCustomConnectedAccount(userId, accountToken);
        row = await upsertAccountRow({
            cms_user_id: userId,
            stripe_account_api_version: "v2",
            ...accountPatchFromStripe(stripeAccount, "v2"),
        });
    } else if (accountToken) {
        stripeAccount = await updateCustomConnectedAccount(row!.stripe_account_id!, accountToken);
    }

    if (!stripeAccount?.id) {
        throw new HttpError(502, "Stripe did not return a connected account");
    }
    if (bankAccountToken) {
        await attachBankAccount(stripeAccount.id, bankAccountToken);
    }
    stripeAccount = await retrieveAccount(stripeAccount.id, "v2");
    row = await upsertAccountRow({
        cms_user_id: userId,
        stripe_account_api_version: "v2",
        ...(bankAccountToken ? { external_bank_account_attached: true } : {}),
        ...accountPatchFromStripe(stripeAccount, "v2"),
    });
    return publicAccount(row);
}
