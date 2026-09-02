import { HttpError } from "./errors.ts";
import { isRecord } from "./records.ts";
import type { JsonRecord, PublishedPage, VerifiedConsentDocument } from "./types.ts";

const snapshotRoute = "/.cms/content/published-page-snapshot";
const maximumContentBytes = 2_000_000;
const maximumAggregateContentBytes = 8_388_608;

export function materializeResolvedDocuments(value: unknown): {
    documents: Array<VerifiedConsentDocument & { enabled: boolean }>;
    snapshotOrigin: string | null;
} {
    if (!Array.isArray(value) || value.length > 8) {
        throw new HttpError(400, "documents must be an array of at most 8 entries");
    }
    const documents = value.map((entry, index) => resolvedDocument(entry, index));
    if (new Set(documents.map((document) => document.key)).size !== documents.length) {
        throw new HttpError(400, "document keys must be unique");
    }
    const origins = new Set(documents.map((document) => new URL(document.publishedSnapshotUrl).origin));
    if (origins.size > 1) {
        throw new HttpError(422, "consent documents must use one CMS Delivery origin");
    }
    return { documents, snapshotOrigin: origins.values().next().value ?? null };
}

function resolvedDocument(value: unknown, index: number): VerifiedConsentDocument & { enabled: boolean } {
    if (!isRecord(value) || !isRecord(value.page)) {
        throw new HttpError(400, `documents[${index}] is invalid`);
    }
    const key = text(value.key, 80);
    if (!/^[a-z][a-z0-9_.-]{0,79}$/.test(key)) {
        throw new HttpError(422, `documents[${index}].key is invalid`);
    }
    const page = pageValue(value.page);
    const publishedSnapshotUrl = text(value.page.publishedSnapshotUrl, 4096);
    if (!isPublishedSnapshotUrl(publishedSnapshotUrl, page.id)) {
        throw new HttpError(422, `documents[${index}].page is not a trusted published snapshot`);
    }
    const label = text(value.label, 200);
    const consentText = text(value.consentText, 1000);
    if (!consentText.includes(label)) {
        throw new HttpError(422, `documents[${index}].consentText must contain label`);
    }
    return {
        key,
        enabled: value.enabled !== false,
        label,
        consentText,
        page,
        publishedSnapshotUrl,
        contentHash: "",
    };
}

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

export async function publishedPageContentHash(page: PublishedPage): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(page)));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isPublishedSnapshotUrl(value: string, pageId: string, approvedOrigin?: string): boolean {
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

function isAllowedOrigin(url: URL): boolean {
    const hostname = url.hostname.toLowerCase();
    if (url.protocol === "http:") {
        return isLocalDevelopmentHost(hostname) && isLocalSupabaseRuntime();
    }
    return url.protocol === "https:" && !isBlockedHttpsHost(hostname);
}

function isBlockedHttpsHost(hostname: string): boolean {
    if (
        isLocalDevelopmentHost(hostname) ||
        hostname.endsWith(".local") ||
        hostname === "metadata.google.internal" ||
        hostname.includes(":")
    ) {
        return true;
    }
    const octets = hostname.split(".").map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
        return false;
    }
    const [first, second, third] = octets as [number, number, number, number];
    return (
        first === 0 ||
        first === 10 ||
        first === 127 ||
        (first === 100 && second >= 64 && second <= 127) ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && (second === 168 || (second === 0 && (third === 0 || third === 2)))) ||
        (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100))) ||
        (first === 203 && second === 0 && third === 113) ||
        first >= 224
    );
}

function isLocalDevelopmentHost(hostname: string): boolean {
    return (
        hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1" || hostname === "[::1]"
    );
}

function isLocalSupabaseRuntime(): boolean {
    try {
        return isLocalDevelopmentHost(new URL(Deno.env.get("SUPABASE_URL") ?? "").hostname.toLowerCase());
    } catch {
        return false;
    }
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

function unavailable(): never {
    throw new HttpError(409, "CONSENT_DOCUMENT_NOT_AVAILABLE");
}
