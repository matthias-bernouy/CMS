import { HttpError } from "../errors.ts";
import type { ConsentDocumentReference, VerifiedConsentDocument } from "../types.ts";
import { publishedPageContentHash } from "./hashing.ts";
import { localSnapshotFetchUrl } from "./url.ts";
import { materializeDocumentReferences, parsePublishedPageSnapshot, unavailable } from "./validation.ts";

const maximumResponseBytes = 2_100_000;
const maximumAggregateContentBytes = 8_388_608;
const maximumConcurrentFetches = 4;
const fetchTimeoutMilliseconds = 4_000;

export async function fetchResolvedDocuments(value: unknown): Promise<{
    documents: Array<VerifiedConsentDocument & { enabled: boolean }>;
    snapshotOrigin: string | null;
}> {
    const references = materializeDocumentReferences(value);
    const documents = new Array<VerifiedConsentDocument & { enabled: boolean }>(references.documents.length);
    let nextIndex = 0;
    let aggregateBytes = 0;
    const worker = async (): Promise<void> => {
        while (nextIndex < references.documents.length) {
            const index = nextIndex++;
            const reference = references.documents[index]!;
            const snapshot = await fetchSnapshot(reference);
            aggregateBytes += new TextEncoder().encode(snapshot.page.content).byteLength;
            if (aggregateBytes > maximumAggregateContentBytes) {
                unavailable();
            }
            documents[index] = { ...reference, page: snapshot.page, contentHash: snapshot.contentHash };
        }
    };
    await Promise.all(Array.from({ length: Math.min(maximumConcurrentFetches, references.documents.length) }, worker));
    return { documents, snapshotOrigin: references.snapshotOrigin };
}

async function fetchSnapshot(reference: ConsentDocumentReference) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), fetchTimeoutMilliseconds);
    try {
        const response = await fetch(localSnapshotFetchUrl(reference.publishedSnapshotUrl), {
            headers: { accept: "application/json" },
            redirect: "error",
            signal: controller.signal,
        });
        if (!response.ok || !response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
            unavailable();
        }
        const snapshot = parsePublishedPageSnapshot(await boundedText(response), reference.pageId);
        if ((await publishedPageContentHash(snapshot.page)) !== snapshot.contentHash) {
            unavailable();
        }
        return snapshot;
    } catch (error) {
        if (error instanceof HttpError) {
            throw error;
        }
        unavailable();
    } finally {
        clearTimeout(timeout);
    }
}

async function boundedText(response: Response): Promise<string> {
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maximumResponseBytes) {
        unavailable();
    }
    const reader = response.body?.getReader();
    if (!reader) {
        unavailable();
    }
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
            unavailable();
        }
        result += decoder.decode(chunk.value, { stream: true });
    }
    return result + decoder.decode();
}
