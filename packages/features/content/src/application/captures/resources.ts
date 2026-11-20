import { parseHTML } from "linkedom";
import { CAPTURE_LIMITS, CaptureError } from "@bernouy/browser-capture";
import type { CaptureDocument } from "@bernouy/browser-capture";

/** Resolves only host-approved local resources; no browser request can become a server fetch. */
export async function bundleCaptureResources(
    html: string,
    publicUrl: string,
    pagePath: string,
    read: (path: string) => Promise<Response>,
    signal?: AbortSignal,
): Promise<CaptureDocument> {
    const origin = new URL(publicUrl).origin;
    const base = new URL(pagePath, origin);
    const path = `${base.pathname.slice(1)}${base.search}`;
    const files = new Map<string, Blob>();
    const queue: URL[] = [];
    const seen = new Set<string>();
    let bytes = 0;
    const add = (url: URL) => {
        if (url.origin !== origin) {
            return;
        }
        url.hash = "";
        if (!seen.has(url.href)) {
            if (seen.size >= CAPTURE_LIMITS.files) {
                throw new CaptureError("LIMIT_EXCEEDED");
            }
            seen.add(url.href);
            queue.push(url);
        }
    };
    const scan = (source: string, type: string, url: URL) => {
        if (type.startsWith("text/html")) {
            const { document } = parseHTML(source);
            for (const element of document.querySelectorAll(
                "script[src],link[href],img[src],source[src],video[poster],image[href]",
            )) {
                const value =
                    element.getAttribute("src") ?? element.getAttribute("poster") ?? element.getAttribute("href");
                if (value) {
                    add(new URL(value, url));
                }
            }
            for (const element of document.querySelectorAll("[srcset]")) {
                for (const candidate of (element.getAttribute("srcset") ?? "").split(",")) {
                    const value = candidate.trim().split(/\s+/u)[0];
                    if (value) {
                        add(new URL(value, url));
                    }
                }
            }
        }
        if (type.startsWith("text/html") || type.startsWith("text/css")) {
            for (const match of source.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)|@import\s+["']([^"']+)["']/gu)) {
                add(new URL(match[1] ?? match[2]!, url));
            }
        }
    };
    const put = (key: string, blob: Blob) => {
        bytes += blob.size;
        if (bytes > CAPTURE_LIMITS.inputBytes || files.size >= CAPTURE_LIMITS.files) {
            throw new CaptureError("LIMIT_EXCEEDED");
        }
        files.set(key, blob);
    };
    put(decodeURIComponent(base.pathname.slice(1)) + base.search, new Blob([html], { type: "text/html" }));
    seen.add(base.href);
    scan(html, "text/html", base);
    for (let index = 0; index < queue.length; index++) {
        signal?.throwIfAborted();
        const url = queue[index]!;
        const response = await read(url.pathname + url.search);
        if (!response.ok) {
            await response.body?.cancel();
            continue;
        }
        const reader = response.body?.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
            if (reader) {
                for (;;) {
                    const item = await reader.read();
                    if (item.done) {
                        break;
                    }
                    size += item.value.byteLength;
                    if (bytes + size > CAPTURE_LIMITS.inputBytes) {
                        throw new CaptureError("LIMIT_EXCEEDED");
                    }
                    chunks.push(item.value);
                }
            }
        } finally {
            await reader?.cancel().catch(() => undefined);
            reader?.releaseLock();
        }
        const type = response.headers.get("content-type") ?? "application/octet-stream";
        let blob = new Blob(
            chunks.map((chunk) => new Uint8Array(chunk)),
            { type },
        );
        if (type.startsWith("text/css")) {
            const css = await blob.text();
            scan(css, type, url);
        }
        put(decodeURIComponent(url.pathname.slice(1)) + url.search, blob);
    }
    return { path, files, origin };
}
