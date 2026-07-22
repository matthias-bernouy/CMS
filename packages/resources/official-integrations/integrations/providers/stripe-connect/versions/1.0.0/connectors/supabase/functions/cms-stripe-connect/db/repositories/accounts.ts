import { HttpError } from "../../http/errors.ts";
import { isRecord, stripUndefined } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";
import { firstRow, rest, restError } from "../postgrest.ts";
import { accountSelect, type ConnectAccountRow, type MarketplaceTermsAcceptanceRow } from "../records/accounts.ts";

export async function getAccountRowByStripeAccountId(stripeAccountId: string): Promise<ConnectAccountRow | null> {
    const response = await rest(
        `accounts?stripe_account_id=eq.${encodeURIComponent(stripeAccountId)}&select=${accountSelect}&limit=1`,
        { method: "GET" },
    );
    if (!response.ok) {
        throw await restError(response);
    }
    const rows = (await response.json()) as ConnectAccountRow[];
    return rows[0] ?? null;
}

export async function getAccountRow(userId: string): Promise<ConnectAccountRow | null> {
    const response = await rest(
        `accounts?cms_user_id=eq.${encodeURIComponent(userId)}&select=${accountSelect}&limit=1`,
        { method: "GET" },
    );
    if (!response.ok) {
        throw await restError(response);
    }
    const rows = (await response.json()) as ConnectAccountRow[];
    return rows[0] ?? null;
}

export async function getMarketplaceTermsAcceptance(
    userId: string,
    version: string,
    hash: string,
): Promise<MarketplaceTermsAcceptanceRow | null> {
    const query = new URLSearchParams({
        cms_user_id: `eq.${userId}`,
        terms_version: `eq.${version}`,
        terms_hash: `eq.${hash}`,
        select: "cms_user_id,terms_version,terms_hash,accepted_at",
        limit: "1",
    });
    const response = await rest(`marketplace_terms_acceptances?${query.toString()}`, { method: "GET" });
    if (!response.ok) {
        throw await restError(response);
    }
    const rows = (await response.json()) as MarketplaceTermsAcceptanceRow[];
    return rows[0] ?? null;
}

export async function recordMarketplaceTermsAcceptance(
    userId: string,
    version: string,
    hash: string,
): Promise<MarketplaceTermsAcceptanceRow> {
    const response = await rest("rpc/record_marketplace_terms_acceptance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            p_cms_user_id: userId,
            p_terms_version: version,
            p_terms_hash: hash,
        }),
    });
    if (!response.ok) {
        throw await restError(response);
    }
    const value = await response.json();
    if (!isRecord(value)) {
        throw new HttpError(502, "Supabase returned an invalid marketplace terms acceptance");
    }
    return value as MarketplaceTermsAcceptanceRow;
}

export async function upsertAccountRow(values: JsonRecord): Promise<ConnectAccountRow> {
    const query = new URLSearchParams();
    query.set("on_conflict", "cms_user_id");
    query.set("select", accountSelect);

    const response = await rest(`accounts?${query.toString()}`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(stripUndefined(values)),
    });
    if (!response.ok) {
        throw await restError(response);
    }
    return firstRow<ConnectAccountRow>(await response.json());
}

export async function updateAccountRow(userId: string, values: JsonRecord): Promise<ConnectAccountRow | null> {
    const response = await rest(`accounts?cms_user_id=eq.${encodeURIComponent(userId)}&select=${accountSelect}`, {
        method: "PATCH",
        headers: {
            "content-type": "application/json",
            prefer: "return=representation",
        },
        body: JSON.stringify(stripUndefined(values)),
    });
    if (!response.ok) {
        throw await restError(response);
    }
    const rows = (await response.json()) as ConnectAccountRow[];
    return rows[0] ?? null;
}
