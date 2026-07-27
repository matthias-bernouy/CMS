import type { ContentReader } from "cms-content/interfaces/ContentReader";
import {
    isPublishedPage,
    publishedPageSnapshot,
    serializePublishedPageSnapshot,
} from "cms-content/core/lifecycle/publication";

export const PUBLISHED_PAGE_SNAPSHOT_ROUTE = "/.cms/content/published-page-snapshot";
export const PUBLISHED_PAGE_SNAPSHOT_SCHEMA = "cms-published-page-snapshot-v1";

export function publishedPageSnapshotUrl(deliveryBaseUrl: string, pageId: string): string {
    const url = new URL(deliveryBaseUrl);
    const basePath = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
    url.pathname = `${basePath}${PUBLISHED_PAGE_SNAPSHOT_ROUTE}`;
    url.search = "";
    url.hash = "";
    url.searchParams.set("id", pageId);
    return url.toString();
}

export async function servePublishedPageSnapshot(repository: ContentReader, request: Request): Promise<Response> {
    const pageId = new URL(request.url).searchParams.get("id");
    if (!pageId) {
        return json({ error: "Missing page id" }, 400);
    }
    if (pageId.length > 512 || /[\u0000-\u001f\u007f]/.test(pageId)) {
        return json({ error: "Invalid page id" }, 400);
    }

    const page = await repository.getPageById(pageId);
    if (!isPublishedPage(page)) {
        return json({ error: "Published page not found" }, 404);
    }

    const snapshot = publishedPageSnapshot(page);
    return json({
        schema: PUBLISHED_PAGE_SNAPSHOT_SCHEMA,
        page: snapshot,
        contentHash: await sha256Hex(serializePublishedPageSnapshot(snapshot)),
    });
}

async function sha256Hex(value: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown, status = 200): Response {
    return Response.json(body, {
        status,
        headers: {
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
        },
    });
}
