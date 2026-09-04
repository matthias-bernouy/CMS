import { getCurrentMarketplaceTermsConfiguration } from "./repository.ts";
import {
    assertAllowedKeys,
    HttpError,
    json,
    type JsonRecord,
    readJsonObject,
    requireCmsRequest,
    rest,
    restError,
} from "./runtime.ts";

type Account = JsonRecord & {
    cms_user_id: string;
    stripe_account_id: string | null;
    stripe_account_api_version: string;
    application_controlled_recipient: boolean;
    terms_accepted: boolean;
    marketplace_terms_accepted_at: string | null;
    provider_account_closed: boolean;
    onboarding_status: string;
    risk_status: string;
    outstanding_debt_amount: number;
    financial_exposure_amount: number;
    financial_hold_reason: string | null;
    manual_payout_hold_started_at: string | null;
};

const accountFields = [
    "cms_user_id",
    "stripe_account_id",
    "stripe_account_api_version",
    "application_controlled_recipient",
    "terms_accepted",
    "marketplace_terms_accepted_at",
    "provider_account_closed",
    "onboarding_status",
    "risk_status",
    "outstanding_debt_amount",
    "financial_exposure_amount",
    "financial_hold_reason",
    "manual_payout_hold_started_at",
].join(",");

export async function listSellerHeldPaymentCapabilities(request: Request): Promise<Response> {
    requireCmsRequest(request, false);
    const body = await readJsonObject(request);
    assertAllowedKeys(body, ["marketplaceTermsVersion", "marketplaceTermsHash"]);
    const current = await getCurrentMarketplaceTermsConfiguration();
    const expected = current ? { version: current.version, hash: current.hash } : explicitExpectation(body);
    const snapshotAt = new Date().toISOString();
    if (!expected) {
        return json({ readySellerCmsUserIds: [], snapshot: "unconfigured", snapshotAt });
    }
    const [accounts, accepted] = await Promise.all([
        paged<Account>(`accounts?select=${accountFields}&order=cms_user_id.asc`),
        acceptedUserIds(expected.version, expected.hash),
    ]);
    return json({
        readySellerCmsUserIds: accounts
            .filter((account) => accepted.has(account.cms_user_id) && ready(account))
            .map((account) => account.cms_user_id),
        snapshot: "persisted_provider_projection",
        snapshotAt,
    });
}

function explicitExpectation(body: JsonRecord): { version: string; hash: string } | null {
    const version = body.marketplaceTermsVersion;
    const hash = body.marketplaceTermsHash;
    if (version === undefined && hash === undefined) {
        return null;
    }
    if (
        typeof version !== "string" ||
        !version.trim() ||
        version.length > 200 ||
        typeof hash !== "string" ||
        !/^[a-f0-9]{64}$/.test(hash)
    ) {
        throw new HttpError(400, "marketplaceTermsVersion and marketplaceTermsHash must be provided together");
    }
    return { version: version.trim(), hash };
}

async function acceptedUserIds(version: string, hash: string): Promise<Set<string>> {
    const query = new URLSearchParams({
        terms_version: `eq.${version}`,
        terms_hash: `eq.${hash}`,
        select: "cms_user_id",
        order: "cms_user_id.asc",
    });
    const rows = await paged<{ cms_user_id: string }>(`marketplace_terms_acceptances?${query}`);
    return new Set(rows.map((row) => row.cms_user_id));
}

async function paged<T>(path: string): Promise<T[]> {
    const rows: T[] = [];
    for (let offset = 0; ; offset += 1_000) {
        const response = await rest(`${path}&limit=1000&offset=${offset}`, { method: "GET" });
        if (!response.ok) {
            throw await restError(response);
        }
        const page = (await response.json()) as T[];
        rows.push(...page);
        if (page.length < 1_000) {
            return rows;
        }
        if (rows.length >= 10_000) {
            throw new HttpError(409, "seller capability reconciliation exceeds 10000 records");
        }
    }
}

function ready(account: Account): boolean {
    return Boolean(
        account.stripe_account_id &&
            account.stripe_account_api_version === "v2" &&
            account.application_controlled_recipient &&
            account.terms_accepted &&
            account.marketplace_terms_accepted_at &&
            !account.provider_account_closed &&
            account.onboarding_status !== "rejected" &&
            !["restricted", "blocked", "manual_review"].includes(account.risk_status) &&
            account.outstanding_debt_amount === 0 &&
            account.financial_exposure_amount === 0 &&
            !account.financial_hold_reason &&
            !account.manual_payout_hold_started_at,
    );
}
