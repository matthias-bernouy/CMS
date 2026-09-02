import type { MarketplaceTermsAcceptanceRow } from "../../../db/records/accounts.ts";
import { rest, restError } from "../../../db/postgrest.ts";
import { HttpError } from "../../../http/errors.ts";
import { isRecord } from "../../../shared/data.ts";
import type { JsonRecord } from "../../../shared/types.ts";

export type MarketplaceTermsExpectation = {
    version: string;
    hash: string;
};

export type MarketplaceTermsConfiguration = MarketplaceTermsExpectation & {
    mode: "legacy" | "published_page";
    documentKey?: string;
    label?: string;
    consentText?: string;
    page?: {
        id: string;
        path: string;
        title: string;
        description: string;
        content: string;
    };
    publishedSnapshotUrl?: string;
    updatedAt: string;
};

export type MarketplaceTermsRequirement = MarketplaceTermsExpectation & {
    mode: "legacy" | "published_page";
    documentKey?: string;
    label?: string;
    consentText?: string;
    page?: {
        id: string;
        path: string;
        title: string;
    };
};

export async function getCurrentMarketplaceTermsConfiguration(): Promise<MarketplaceTermsConfiguration | null> {
    const value = await callMarketplaceTermsRpc("get_current_marketplace_terms_configuration", {});
    if (value === null) {
        return null;
    }
    return marketplaceTermsConfiguration(value);
}

export async function syncMarketplaceTermsConfiguration(values: {
    document: JsonRecord | null;
    legacyVersion: string | null;
    legacyHash: string | null;
    actorId: string;
}): Promise<MarketplaceTermsConfiguration> {
    return marketplaceTermsConfiguration(
        await callMarketplaceTermsRpc("sync_marketplace_terms_configuration", {
            p_document: values.document,
            p_legacy_version: values.legacyVersion,
            p_legacy_hash: values.legacyHash,
            p_actor_id: values.actorId,
        }),
    );
}

export async function recordCurrentMarketplaceTermsAcceptance(
    userId: string,
    expected: MarketplaceTermsExpectation | null,
): Promise<MarketplaceTermsAcceptanceRow> {
    const value = await callMarketplaceTermsRpc("record_current_marketplace_terms_acceptance", {
        p_cms_user_id: userId,
        p_expected_version: expected?.version ?? null,
        p_expected_hash: expected?.hash ?? null,
    });
    if (!isRecord(value)) {
        throw new HttpError(502, "Supabase returned an invalid marketplace terms acceptance");
    }
    return value as MarketplaceTermsAcceptanceRow;
}

export function marketplaceTermsRequirement(
    configuration: MarketplaceTermsConfiguration | null,
): MarketplaceTermsRequirement | null {
    if (!configuration) {
        return null;
    }
    const requirement: MarketplaceTermsRequirement = {
        mode: configuration.mode,
        version: configuration.version,
        hash: configuration.hash,
    };
    if (
        configuration.mode === "published_page" &&
        configuration.documentKey &&
        configuration.label &&
        configuration.consentText &&
        configuration.page
    ) {
        return {
            ...requirement,
            documentKey: configuration.documentKey,
            label: configuration.label,
            consentText: configuration.consentText,
            page: {
                id: configuration.page.id,
                path: configuration.page.path,
                title: configuration.page.title,
            },
        };
    }
    return requirement;
}

export function marketplaceTermsExpectation(
    configuration: MarketplaceTermsConfiguration | null,
): MarketplaceTermsExpectation | null {
    return configuration ? { version: configuration.version, hash: configuration.hash } : null;
}

export function effectiveMarketplaceTermsExpectation(
    explicit: MarketplaceTermsExpectation | null,
    configuration: MarketplaceTermsConfiguration | null,
): MarketplaceTermsExpectation | null {
    return marketplaceTermsExpectation(configuration) ?? explicit;
}

async function callMarketplaceTermsRpc(name: string, body: JsonRecord): Promise<unknown> {
    const response = await rest(`rpc/${name}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw await restError(response);
    }
    return response.json();
}

function marketplaceTermsConfiguration(value: unknown): MarketplaceTermsConfiguration {
    if (
        !isRecord(value) ||
        (value.mode !== "legacy" && value.mode !== "published_page") ||
        typeof value.version !== "string" ||
        !value.version ||
        typeof value.hash !== "string" ||
        !/^[a-f0-9]{64}$/.test(value.hash) ||
        typeof value.updatedAt !== "string"
    ) {
        throw new HttpError(502, "Supabase returned an invalid marketplace terms configuration");
    }
    if (value.mode === "legacy") {
        return {
            mode: value.mode,
            version: value.version,
            hash: value.hash,
            updatedAt: value.updatedAt,
        };
    }
    if (
        typeof value.documentKey !== "string" ||
        typeof value.label !== "string" ||
        typeof value.consentText !== "string" ||
        !isPublishedPage(value.page) ||
        typeof value.publishedSnapshotUrl !== "string"
    ) {
        throw new HttpError(502, "Supabase returned incomplete published marketplace terms");
    }
    return {
        mode: value.mode,
        version: value.version,
        hash: value.hash,
        documentKey: value.documentKey,
        label: value.label,
        consentText: value.consentText,
        page: value.page,
        publishedSnapshotUrl: value.publishedSnapshotUrl,
        updatedAt: value.updatedAt,
    };
}

function isPublishedPage(value: unknown): value is MarketplaceTermsConfiguration["page"] {
    return (
        isRecord(value) &&
        typeof value.id === "string" &&
        typeof value.path === "string" &&
        typeof value.title === "string" &&
        typeof value.description === "string" &&
        typeof value.content === "string"
    );
}
