import { HttpError } from "../errors.ts";
import { isRecord } from "../records.ts";
import type { ConsentDocumentReference, JsonRecord, PublishedPage, VerifiedConsentDocument } from "../types.ts";
import { pageIdFromSnapshotUrl } from "./url.ts";

const snapshotSchema = "cms-published-page-snapshot-v1";
const maximumContentBytes = 2_000_000;
const hashPattern = /^[a-f0-9]{64}$/;

export function materializeDocumentReferences(value: unknown): {
    documents: ConsentDocumentReference[];
    snapshotOrigin: string | null;
} {
    if (!Array.isArray(value) || value.length > 8) {
        throw new HttpError(400, "documents must be an array of at most 8 entries");
    }
    const documents = value.map((entry, index) => documentReference(entry, index));
    validateCollection(documents);
    return { documents, snapshotOrigin: originOf(documents) };
}

export function materializeResolvedDocuments(value: unknown): {
    documents: Array<VerifiedConsentDocument & { enabled: boolean }>;
    snapshotOrigin: string | null;
} {
    if (!Array.isArray(value) || value.length > 8) {
        throw new HttpError(400, "documents must be an array of at most 8 entries");
    }
    const documents = value.map((entry, index) => resolvedDocument(entry, index));
    validateCollection(documents);
    return { documents, snapshotOrigin: originOf(documents) };
}

export function parsePublishedPageSnapshot(
    value: string,
    expectedPageId: string,
): {
    page: PublishedPage;
    contentHash: string;
} {
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        unavailable();
    }
    if (!isRecord(parsed) || parsed.schema !== snapshotSchema || !isRecord(parsed.page)) {
        unavailable();
    }
    const page = pageValue(parsed.page);
    if (page.id !== expectedPageId || typeof parsed.contentHash !== "string" || !hashPattern.test(parsed.contentHash)) {
        unavailable();
    }
    return { page, contentHash: parsed.contentHash };
}

export function unavailable(): never {
    throw new HttpError(409, "CONSENT_DOCUMENT_NOT_AVAILABLE");
}

function documentReference(value: unknown, index: number): ConsentDocumentReference {
    if (!isRecord(value)) {
        throw new HttpError(400, `documents[${index}] is invalid`);
    }
    const publishedSnapshotUrl = text(value.publishedSnapshotUrl, 4096);
    const pageId = pageIdFromSnapshotUrl(publishedSnapshotUrl);
    return {
        key: documentKey(value.key, index),
        enabled: value.enabled !== false,
        label: consentLabel(value.label, index),
        consentText: consentCopy(value.consentText, value.label, index),
        pageId,
        publishedSnapshotUrl,
    };
}

function resolvedDocument(value: unknown, index: number): VerifiedConsentDocument & { enabled: boolean } {
    if (!isRecord(value) || !isRecord(value.page)) {
        throw new HttpError(400, `documents[${index}] is invalid`);
    }
    const page = pageValue(value.page);
    const publishedSnapshotUrl = text(value.page.publishedSnapshotUrl, 4096);
    if (pageIdFromSnapshotUrl(publishedSnapshotUrl) !== page.id) {
        throw new HttpError(422, `documents[${index}].page is not a trusted published snapshot`);
    }
    return {
        key: documentKey(value.key, index),
        enabled: value.enabled !== false,
        label: consentLabel(value.label, index),
        consentText: consentCopy(value.consentText, value.label, index),
        page,
        publishedSnapshotUrl,
        contentHash: "",
    };
}

function validateCollection(documents: Array<{ key: string; publishedSnapshotUrl: string }>): void {
    if (new Set(documents.map((document) => document.key)).size !== documents.length) {
        throw new HttpError(400, "document keys must be unique");
    }
    if (new Set(documents.map((document) => new URL(document.publishedSnapshotUrl).origin)).size > 1) {
        throw new HttpError(422, "consent documents must use one CMS Delivery origin");
    }
}

function originOf(documents: Array<{ publishedSnapshotUrl: string }>): string | null {
    return documents.length ? new URL(documents[0]!.publishedSnapshotUrl).origin : null;
}

function pageValue(value: JsonRecord): PublishedPage {
    const page = {
        id: stringValue(value.id, 512),
        path: stringValue(value.path, 2048),
        title: stringValue(value.title, 500),
        description: stringValue(value.description, 1000, true),
        content: stringValue(value.content, Number.MAX_SAFE_INTEGER),
    };
    if (
        !page.path.startsWith("/") ||
        page.path.startsWith("//") ||
        page.path.includes("\\") ||
        /[\u0000-\u001f\u007f]/u.test(page.path) ||
        new TextEncoder().encode(page.content).byteLength > maximumContentBytes
    ) {
        unavailable();
    }
    return page;
}

function documentKey(value: unknown, index: number): string {
    const result = text(value, 80);
    if (!/^[a-z][a-z0-9_.-]{0,79}$/.test(result)) {
        throw new HttpError(422, `documents[${index}].key is invalid`);
    }
    return result;
}

function consentLabel(value: unknown, index: number): string {
    return documentText(value, 200, `documents[${index}].label`);
}

function consentCopy(value: unknown, label: unknown, index: number): string {
    const result = documentText(value, 1000, `documents[${index}].consentText`);
    if (typeof label !== "string" || !result.includes(label.trim())) {
        throw new HttpError(422, `documents[${index}].consentText must contain label`);
    }
    return result;
}

function documentText(value: unknown, maximum: number, name: string): string {
    if (typeof value !== "string" || !value.trim() || value.length > maximum) {
        throw new HttpError(422, `${name} is invalid`);
    }
    return value.trim();
}

function text(value: unknown, maximum: number): string {
    if (typeof value !== "string" || !value.trim() || value.length > maximum) {
        throw new HttpError(422, "invalid consent document text");
    }
    return value.trim();
}

function stringValue(value: unknown, maximum: number, allowEmpty = false): string {
    if (typeof value !== "string" || value.length > maximum || (!allowEmpty && !value.trim())) {
        unavailable();
    }
    return value;
}
