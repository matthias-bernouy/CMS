import { HttpError, isRecord, type JsonRecord, rest, restError } from "./runtime.ts";

export type MarketplaceTermsConfiguration = {
    mode: "legacy" | "published_page";
    version: string;
    hash: string;
    documentKey?: string;
    label?: string;
    consentText?: string;
    page?: JsonRecord;
    publishedSnapshotUrl?: string;
    updatedAt: string;
};

export async function getCurrentMarketplaceTermsConfiguration(): Promise<MarketplaceTermsConfiguration | null> {
    const response = await rpc("get_current_marketplace_terms_configuration", {});
    return response === null ? null : marketplaceTermsConfiguration(response);
}

export async function publishMarketplaceTermsConfiguration(values: {
    document: JsonRecord;
    actorId: string;
    expectedVersion: string;
}): Promise<MarketplaceTermsConfiguration> {
    return marketplaceTermsConfiguration(
        await rpc("publish_marketplace_terms_configuration", {
            p_document: values.document,
            p_actor_id: values.actorId,
            p_expected_version: values.expectedVersion,
        }),
    );
}

async function rpc(name: string, body: JsonRecord): Promise<unknown> {
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
    const base: Pick<MarketplaceTermsConfiguration, "mode" | "version" | "hash" | "updatedAt"> = {
        mode: value.mode,
        version: value.version,
        hash: value.hash,
        updatedAt: value.updatedAt,
    };
    if (value.mode === "legacy") {
        return base;
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
        ...base,
        documentKey: value.documentKey,
        label: value.label,
        consentText: value.consentText,
        page: value.page,
        publishedSnapshotUrl: value.publishedSnapshotUrl,
    };
}

function isPublishedPage(value: unknown): value is JsonRecord {
    return (
        isRecord(value) &&
        typeof value.id === "string" &&
        typeof value.path === "string" &&
        typeof value.title === "string" &&
        typeof value.description === "string" &&
        typeof value.content === "string"
    );
}
