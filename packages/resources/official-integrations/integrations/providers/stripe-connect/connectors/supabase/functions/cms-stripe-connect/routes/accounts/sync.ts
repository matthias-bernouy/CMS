import { getAccountRow, getAccountRowByStripeAccountId, updateAccountRow } from "../../db/repositories/accounts.ts";
import type { ConnectAccountRow } from "../../db/records/accounts.ts";
import { accountPatchFromStripe } from "../../domain/accounts/provider-projection.ts";
import { retrieveAccount } from "../../provider/accounts/lifecycle.ts";

export async function syncAccountForUser(userId: string): Promise<ConnectAccountRow | null> {
    const account = await getAccountRow(userId);
    if (!account?.stripe_account_id) {
        return account;
    }
    const stripeAccount = await retrieveAccount(account.stripe_account_id, account.stripe_account_api_version);
    return await updateAccountRow(userId, accountPatchFromStripe(stripeAccount, account.stripe_account_api_version));
}

export async function syncAccountForIdentity(identity: string): Promise<ConnectAccountRow | null> {
    const byStripeAccount = await getAccountRowByStripeAccountId(identity);
    return byStripeAccount ? syncAccountForUser(byStripeAccount.cms_user_id) : syncAccountForUser(identity);
}
