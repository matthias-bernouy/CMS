import { HttpError } from "./errors.ts";
import { isRecord } from "./records.ts";
import type { JsonRecord } from "./types.ts";

const snapshotSchema = "cms-published-page-snapshot-v1";
const snapshotRoute = "/.cms/content/published-page-snapshot";
const maximumContentBytes = 2_000_000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hashPattern = /^[a-f0-9]{64}$/;

export type PublishedPage = {
    id: string;
    path: string;
    title: string;
    description: string;
    content: string;
};

export type VerificationDocument = {
    key: string;
    versionId: string;
    pageId: string;
    publishedSnapshotUrl: string;
};

export type BuyerLegalVerificationContext = {
    enabled: boolean;
    paymentAlreadyCreated: boolean;
    approvedSnapshotOrigin: string | null;
    documents: VerificationDocument[];
};

export function isPublishedSnapshotUrl(value: string, pageId: string, approvedOrigin?: string): boolean {
    try {
        const url = new URL(value);
        return (
            isAllowedOrigin(url) &&
            (!approvedOrigin || url.origin === approvedOrigin) &&
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

export function buyerLegalVerificationContext(value: unknown): BuyerLegalVerificationContext {
    if (!isRecord(value) || typeof value.enabled !== "boolean" || !Array.isArray(value.documents)) {
        unavailableSnapshot();
    }
    if (value.documents.length > 20) {
        unavailableSnapshot();
    }
    const approvedSnapshotOrigin =
        typeof value.approvedSnapshotOrigin === "string" ? value.approvedSnapshotOrigin : null;
    if (value.enabled && (!approvedSnapshotOrigin || !isAllowedOriginValue(approvedSnapshotOrigin))) {
        unavailableSnapshot();
    }
    return {
        enabled: value.enabled,
        paymentAlreadyCreated: value.paymentAlreadyCreated === true,
        approvedSnapshotOrigin,
        documents: value.documents.map((document) =>
            verificationDocument(document, approvedSnapshotOrigin ?? undefined),
        ),
    };
}

export function parsePublishedPageSnapshot(value: string): { page: PublishedPage; contentHash: string } {
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        unavailableSnapshot();
    }
    if (!isRecord(parsed) || parsed.schema !== snapshotSchema || !isRecord(parsed.page)) {
        unavailableSnapshot();
    }
    const page = pageValue(parsed.page);
    if (typeof parsed.contentHash !== "string" || !hashPattern.test(parsed.contentHash)) {
        unavailableSnapshot();
    }
    return { page, contentHash: parsed.contentHash };
}

export function unavailableSnapshot(): never {
    throw new HttpError(409, "LEGAL_DOCUMENT_NOT_AVAILABLE");
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

function verificationDocument(value: unknown, approvedOrigin?: string): VerificationDocument {
    if (!isRecord(value)) {
        unavailableSnapshot();
    }
    const key = stringValue(value.key, 80);
    const versionId = stringValue(value.versionId, 36);
    const pageId = stringValue(value.pageId, 512);
    const publishedSnapshotUrl = stringValue(value.publishedSnapshotUrl, 4_096);
    if (
        !key ||
        !uuidPattern.test(versionId) ||
        !pageId ||
        !isPublishedSnapshotUrl(publishedSnapshotUrl, pageId, approvedOrigin)
    ) {
        unavailableSnapshot();
    }
    return { key, versionId, pageId, publishedSnapshotUrl };
}

function stringValue(value: unknown, maximum: number, allowEmpty = false): string {
    if (typeof value !== "string" || value.length > maximum || (!allowEmpty && !value)) {
        unavailableSnapshot();
    }
    return value;
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

function isAllowedOriginValue(value: string): boolean {
    try {
        const url = new URL(value);
        return url.origin === value && isAllowedOrigin(url);
    } catch {
        return false;
    }
}
