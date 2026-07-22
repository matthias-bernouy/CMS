import { getAccountRow, getMarketplaceTermsAcceptance } from "../../db/repositories/accounts.ts";
import { publicAccountStatus } from "../../domain/accounts/presentation.ts";
import { publicSellerProviderRisk, publicWalletBalances } from "../../domain/accounts/risk-presentation.ts";
import { requireCmsRequest, requireDashboardAdmin } from "../../http/auth.ts";
import { marketplaceTermsExpectationFromRequest } from "../../http/body/index.ts";
import { requiredQueryText } from "../../http/query.ts";
import { json } from "../../http/responses.ts";
import { retrieveConnectedBalance, retrieveConnectedBalanceSettings } from "../../provider/accounts/balances.ts";
import { HttpError } from "../../http/errors.ts";
import { syncAccountForUser } from "./sync.ts";

export async function connectStatus(request: Request): Promise<Response> {
    const { userId } = requireCmsRequest(request);
    const expectedTerms = marketplaceTermsExpectationFromRequest(request);
    const account = await syncAccountForUser(userId);
    const currentTermsAccepted = Boolean(
        account &&
            expectedTerms &&
            (await getMarketplaceTermsAcceptance(userId, expectedTerms.version, expectedTerms.hash)),
    );
    return json(publicAccountStatus(account, userId, { currentTermsAccepted }));
}

export async function connectWallet(request: Request): Promise<Response> {
    const { userId } = requireCmsRequest(request);
    const account = await getAccountRow(userId);
    const refreshedAt = new Date().toISOString();
    if (!account?.stripe_account_id) {
        return json({ connected: false, balances: [], refreshedAt });
    }

    const stripeBalance = await retrieveConnectedBalance(account.stripe_account_id);
    return json({
        connected: true,
        stripeAccountId: account.stripe_account_id,
        livemode: stripeBalance.livemode === true,
        balances: publicWalletBalances(stripeBalance),
        refreshedAt,
    });
}

export async function getSellerProviderRisk(request: Request): Promise<Response> {
    requireDashboardAdmin(request);
    const userId = requiredQueryText(request, "userId", 200);
    const account = await syncAccountForUser(userId);
    if (!account?.stripe_account_id) {
        throw new HttpError(404, "connected account not found");
    }
    const [balance, balanceSettings] = await Promise.all([
        retrieveConnectedBalance(account.stripe_account_id),
        retrieveConnectedBalanceSettings(account.stripe_account_id),
    ]);
    return json(publicSellerProviderRisk(account, balance, balanceSettings));
}
