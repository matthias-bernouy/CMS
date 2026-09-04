import { HttpError } from "../../../http/errors.ts";
import { isRecord } from "../../../shared/data.ts";
import type { JsonRecord } from "../../../shared/types.ts";
import { publishedPageContentHash, type PublishedPage } from "./canonical-page.ts";

const snapshotRoute = "/.cms/content/published-page-snapshot";
const maximumContentBytes = 2_000_000;

export async function materializePublishedMarketplaceTerms(value: unknown): Promise<{
    page: PublishedPage;
    publishedSnapshotUrl: string;
    contentHash: string;
}> {
    if (!isRecord(value)) {
        unavailableSnapshot();
    }
    const expectedPage = pageValue(value);
    const publishedSnapshotUrl = stringValue(value.publishedSnapshotUrl, 4_096);
    if (!isPublishedSnapshotUrl(publishedSnapshotUrl, expectedPage.id)) {
        unavailableSnapshot();
    }
    return {
        page: expectedPage,
        publishedSnapshotUrl,
        contentHash: await publishedPageContentHash(expectedPage),
    };
}

function pageValue(value: JsonRecord): PublishedPage {
    const id = stringValue(value.id, 512);
    const path = stringValue(value.path, 2_048);
    const title = stringValue(value.title, 500);
    const description = stringValue(value.description, 1_000, true);
    const content = stringValue(value.content, Number.MAX_SAFE_INTEGER);
    if (!id || !path.startsWith("/") || !title.trim() || !content.trim()) {
        unavailableSnapshot();
    }
    if (new TextEncoder().encode(content).byteLength > maximumContentBytes) {
        unavailableSnapshot();
    }
    return { id, path, title, description, content };
}

function isPublishedSnapshotUrl(value: string, pageId: string): boolean {
    try {
        const url = new URL(value);
        return (
            isAllowedOrigin(url) &&
            !url.username &&
            !url.password &&
            !url.hash &&
            url.pathname.endsWith(snapshotRoute) &&
            [...url.searchParams.keys()].every((key) => key === "id") &&
            url.searchParams.getAll("id").length === 1 &&
            url.searchParams.get("id") === pageId
        );
    } catch {
        return false;
    }
}

function isAllowedOrigin(url: URL): boolean {
    return (
        url.protocol === "https:" ||
        (url.protocol === "http:" &&
            (url.hostname === "localhost" ||
                url.hostname.endsWith(".localhost") ||
                url.hostname === "127.0.0.1" ||
                url.hostname === "[::1]"))
    );
}

function stringValue(value: unknown, maximum: number, allowEmpty = false): string {
    if (typeof value !== "string" || value.length > maximum || (!allowEmpty && !value)) {
        unavailableSnapshot();
    }
    return value;
}

function unavailableSnapshot(): never {
    throw new HttpError(409, "MARKETPLACE_TERMS_DOCUMENT_NOT_AVAILABLE");
}
