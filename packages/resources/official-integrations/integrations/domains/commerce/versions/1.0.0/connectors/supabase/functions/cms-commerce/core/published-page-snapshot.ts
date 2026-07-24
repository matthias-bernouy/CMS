import type { JsonRecord } from "./types.ts";
import {
    isPublishedSnapshotUrl,
    parsePublishedPageSnapshot,
    unavailableSnapshot,
    type BuyerLegalVerificationContext,
    type PublishedPage,
    type VerificationDocument,
} from "./published-page-snapshot-validation.ts";

const maximumResponseBytes = 16_777_216;
const fetchTimeoutMilliseconds = 4_000;

export {
    buyerLegalVerificationContext,
    isPublishedSnapshotUrl,
} from "./published-page-snapshot-validation.ts";
export type {
    BuyerLegalVerificationContext,
    PublishedPage,
} from "./published-page-snapshot-validation.ts";

export async function publishedPageContentHash(page: PublishedPage): Promise<string> {
    const serialized = JSON.stringify({
        id: page.id,
        path: page.path,
        title: page.title,
        description: page.description,
        content: page.content,
    });
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function fetchVerifiedBuyerLegalDocuments(context: BuyerLegalVerificationContext): Promise<JsonRecord[]> {
    if (!context.enabled || context.paymentAlreadyCreated) {
        return [];
    }
    return Promise.all(
        context.documents.map(async (document) => {
            const snapshot = await fetchPublishedPage(document);
            return {
                key: document.key,
                expectedVersionId: document.versionId,
                contentHash: snapshot.contentHash,
                page: snapshot.page,
            };
        }),
    );
}

async function fetchPublishedPage(
    document: VerificationDocument,
): Promise<{ page: PublishedPage; contentHash: string }> {
    if (!isPublishedSnapshotUrl(document.publishedSnapshotUrl, document.pageId)) {
        unavailableSnapshot();
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), fetchTimeoutMilliseconds);
    try {
        const response = await fetch(document.publishedSnapshotUrl, {
            headers: { accept: "application/json" },
            redirect: "error",
            signal: controller.signal,
        });
        if (!response.ok || !response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
            unavailableSnapshot();
        }
        const value = parsePublishedPageSnapshot(await boundedText(response));
        if (value.page.id !== document.pageId || (await publishedPageContentHash(value.page)) !== value.contentHash) {
            unavailableSnapshot();
        }
        return value;
    } catch {
        unavailableSnapshot();
    } finally {
        clearTimeout(timeout);
    }
}

async function boundedText(response: Response): Promise<string> {
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > maximumResponseBytes) {
        unavailableSnapshot();
    }
    if (!response.body) {
        unavailableSnapshot();
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let result = "";
    while (true) {
        const chunk = await reader.read();
        if (chunk.done) {
            break;
        }
        size += chunk.value.byteLength;
        if (size > maximumResponseBytes) {
            await reader.cancel();
            unavailableSnapshot();
        }
        result += decoder.decode(chunk.value, { stream: true });
    }
    return result + decoder.decode();
}
