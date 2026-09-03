import { HttpError } from "../errors.ts";
import type { PublishedPage, VerifiedConsentDocument } from "../types.ts";

const maximumAggregateContentBytes = 8_388_608;

export async function hashResolvedDocuments(
    documents: Array<VerifiedConsentDocument & { enabled: boolean }>,
): Promise<Array<VerifiedConsentDocument & { enabled: boolean }>> {
    let aggregateBytes = 0;
    const result = await Promise.all(
        documents.map(async (document) => {
            aggregateBytes += new TextEncoder().encode(document.page.content).byteLength;
            if (aggregateBytes > maximumAggregateContentBytes) {
                throw new HttpError(422, "consent document content exceeds 8 MiB");
            }
            return { ...document, contentHash: await publishedPageContentHash(document.page) };
        }),
    );
    return result;
}

export async function publishedPageContentHash(page: PublishedPage): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(page)));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
