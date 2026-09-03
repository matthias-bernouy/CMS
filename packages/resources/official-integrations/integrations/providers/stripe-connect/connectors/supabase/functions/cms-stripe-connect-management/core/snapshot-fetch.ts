import { materializePublishedMarketplaceTerms } from "./document.ts";
import { HttpError, isRecord, type JsonRecord } from "./runtime.ts";

const snapshotRoute = "/.cms/content/published-page-snapshot";

export async function fetchPublishedMarketplaceTermsPage(value: unknown): Promise<JsonRecord> {
    const reference = snapshotReference(value);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4_000);
    try {
        const response = await fetch(reference.url, {
            headers: { accept: "application/json" },
            redirect: "error",
            signal: controller.signal,
        });
        if (!response.ok || !response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
            unavailable();
        }
        const payload = parseSnapshot(await boundedText(response), reference.pageId);
        const materialized = await materializePublishedMarketplaceTerms({
            ...payload.page,
            publishedSnapshotUrl: reference.url,
        });
        if (payload.contentHash !== materialized.contentHash) {
            unavailable();
        }
        return { ...materialized.page, publishedSnapshotUrl: reference.url };
    } catch (error) {
        if (error instanceof HttpError) {
            throw error;
        }
        unavailable();
    } finally {
        clearTimeout(timeout);
    }
}

function snapshotReference(value: unknown): { url: string; pageId: string } {
    if (typeof value !== "string" || !value.trim() || value.length > 4_096) {
        unavailable();
    }
    try {
        const url = new URL(value.trim());
        const pageId = url.searchParams.get("id") ?? "";
        if (
            !allowedOrigin(url) ||
            url.username ||
            url.password ||
            url.hash ||
            !url.pathname.endsWith(snapshotRoute) ||
            [...url.searchParams.keys()].some((key) => key !== "id") ||
            url.searchParams.getAll("id").length !== 1 ||
            !pageId.trim() ||
            pageId.length > 512
        ) {
            unavailable();
        }
        return { url: url.toString(), pageId };
    } catch (error) {
        if (error instanceof HttpError) {
            throw error;
        }
        unavailable();
    }
}

function parseSnapshot(value: string, pageId: string): { page: JsonRecord; contentHash: string } {
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        unavailable();
    }
    if (
        !isRecord(parsed) ||
        parsed.schema !== "cms-published-page-snapshot-v1" ||
        !isRecord(parsed.page) ||
        parsed.page.id !== pageId ||
        typeof parsed.contentHash !== "string" ||
        !/^[a-f0-9]{64}$/.test(parsed.contentHash)
    ) {
        unavailable();
    }
    return { page: parsed.page, contentHash: parsed.contentHash };
}

async function boundedText(response: Response): Promise<string> {
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > 2_100_000) {
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
            return result + decoder.decode();
        }
        size += chunk.value.byteLength;
        if (size > 2_100_000) {
            await reader.cancel();
            unavailable();
        }
        result += decoder.decode(chunk.value, { stream: true });
    }
}

function allowedOrigin(url: URL): boolean {
    const hostname = url.hostname.toLowerCase();
    if (url.protocol === "http:") {
        return isLocalHost(hostname) && localRuntime();
    }
    return url.protocol === "https:" && !blockedHttpsHost(hostname);
}

function blockedHttpsHost(hostname: string): boolean {
    if (
        isLocalHost(hostname) ||
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

function isLocalHost(hostname: string): boolean {
    return (
        hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "127.0.0.1" || hostname === "[::1]"
    );
}

function localRuntime(): boolean {
    try {
        return isLocalHost(new URL(Deno.env.get("SUPABASE_URL") ?? "").hostname.toLowerCase());
    } catch {
        return false;
    }
}

function unavailable(): never {
    throw new HttpError(409, "MARKETPLACE_TERMS_DOCUMENT_NOT_AVAILABLE");
}
