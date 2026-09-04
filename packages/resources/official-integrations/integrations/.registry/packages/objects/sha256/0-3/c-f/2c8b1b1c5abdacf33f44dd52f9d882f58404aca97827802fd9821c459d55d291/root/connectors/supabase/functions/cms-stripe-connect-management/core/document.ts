import { assertAllowedKeys, HttpError, isRecord, type JsonRecord, sha256Hex } from "./runtime.ts";

export type PublishedPage = {
    id: string;
    path: string;
    title: string;
    description: string;
    content: string;
};

export async function publishedMarketplaceTermsDocument(value: unknown): Promise<JsonRecord> {
    if (!isRecord(value)) {
        throw new HttpError(400, "document must be an object");
    }
    assertAllowedKeys(value, ["key", "label", "consentText", "page"]);
    const documentKey = requiredText(value.key, "document.key", 80);
    if (!/^[a-z][a-z0-9_.-]{1,79}$/.test(documentKey)) {
        throw new HttpError(422, "document.key is invalid");
    }
    const label = requiredText(value.label, "document.label", 200);
    const consentText = requiredText(value.consentText, "document.consentText", 1_000);
    const snapshot = await materializePublishedMarketplaceTerms(value.page);
    const revisionHash = await sha256Hex(
        JSON.stringify({
            documentKey,
            label,
            consentText,
            page: JSON.parse(serializePublishedPage(snapshot.page)),
            contentHash: snapshot.contentHash,
        }),
    );
    return { documentKey, label, consentText, ...snapshot, revisionHash };
}

export async function materializePublishedMarketplaceTerms(value: unknown): Promise<{
    page: PublishedPage;
    publishedSnapshotUrl: string;
    contentHash: string;
}> {
    if (!isRecord(value)) {
        unavailable();
    }
    const page = pageValue(value);
    const publishedSnapshotUrl = text(value.publishedSnapshotUrl, 4_096);
    if (!validSnapshotUrl(publishedSnapshotUrl, page.id)) {
        unavailable();
    }
    return { page, publishedSnapshotUrl, contentHash: await sha256Hex(serializePublishedPage(page)) };
}

function pageValue(value: JsonRecord): PublishedPage {
    const id = text(value.id, 512);
    const path = text(value.path, 2_048);
    const title = text(value.title, 500);
    const description = text(value.description, 1_000, true);
    const content = text(value.content, Number.MAX_SAFE_INTEGER);
    if (
        !path.startsWith("/") ||
        !title.trim() ||
        !content.trim() ||
        new TextEncoder().encode(content).byteLength > 2_000_000
    ) {
        unavailable();
    }
    return { id, path, title, description, content };
}

function serializePublishedPage(page: PublishedPage): string {
    return JSON.stringify({
        id: page.id,
        path: page.path,
        title: page.title,
        description: page.description,
        content: page.content,
    });
}

function validSnapshotUrl(value: string, pageId: string): boolean {
    try {
        const url = new URL(value);
        return (
            (url.protocol === "https:" || (url.protocol === "http:" && isLocalHost(url.hostname))) &&
            !url.username &&
            !url.password &&
            !url.hash &&
            url.pathname.endsWith("/.cms/content/published-page-snapshot") &&
            [...url.searchParams.keys()].every((key) => key === "id") &&
            url.searchParams.getAll("id").length === 1 &&
            url.searchParams.get("id") === pageId
        );
    } catch {
        return false;
    }
}

function requiredText(value: unknown, name: string, maximum: number): string {
    if (typeof value !== "string") {
        throw new HttpError(400, `${name} is required`);
    }
    const normalized = value.trim();
    if (!normalized || normalized.length > maximum) {
        throw new HttpError(422, `${name} is invalid`);
    }
    return normalized;
}

function text(value: unknown, maximum: number, allowEmpty = false): string {
    if (typeof value !== "string" || value.length > maximum || (!allowEmpty && !value)) {
        unavailable();
    }
    return value;
}

function isLocalHost(hostname: string): boolean {
    return (
        hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1" || hostname === "[::1]"
    );
}

function unavailable(): never {
    throw new HttpError(409, "MARKETPLACE_TERMS_DOCUMENT_NOT_AVAILABLE");
}
