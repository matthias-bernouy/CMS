import type { Runner } from "@bernouy/http-runner";
import type { CmsFilesMetadataRepository } from "cms-files/interfaces/CmsFilesMetadataRepository";
import type { CmsFilesBlobStore } from "cms-files/interfaces/CmsFilesBlobStore";
import { variantKey } from "cms-files/core/imageVariants";

export type VariantServeDeps = {
    metadata:     CmsFilesMetadataRepository;
    /** Source bytes (the originals), for the best-effort fallback. */
    sourceBlob:   CmsFilesBlobStore;
    /** Shared variant store (S3 in prod), where the worker writes variants. */
    variantStore: CmsFilesBlobStore;
};

const MAX_WIDTH = 4000; // sanity bound on the URL; no generation happens here
const notFound = () => new Response("Not found", { status: 404 });

/**
 * Serve a responsive image variant: `<prefix>/<id>/<width>.webp`.
 *
 * This endpoint NEVER generates — generation is the background worker's job. It
 * is a pure lookup with a graceful fallback:
 *  - variant present in the shared store → stream it **immutable** (it is
 *    content-addressed by the source's `contentHash`, so it can never go stale);
 *  - variant absent (not generated yet, or an arbitrary width) → stream the
 *    **original** bytes with `no-cache`, so the page works immediately
 *    (best-effort) and the browser re-fetches once the variant exists.
 *
 * Because nothing is generated on the request path, an attacker requesting
 * arbitrary widths only ever gets the original — no resize-DoS vector.
 */
export async function serveVariantRequest(
    deps: VariantServeDeps,
    req: Request,
    opts: { prefix: string },
): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (!pathname.startsWith(opts.prefix)) return notFound();

    let segments: string[];
    try { segments = pathname.slice(opts.prefix.length).split("/").map(decodeURIComponent); }
    catch { return notFound(); }
    segments = segments.map((s) => s.trim()).filter(Boolean);
    if (segments.length !== 2) return notFound();

    const [id, leaf] = segments;
    const m = /^(\d+)\.(webp)$/.exec(leaf!);
    if (!m) return notFound();
    const width = Number(m[1]);
    if (!Number.isInteger(width) || width < 1 || width > MAX_WIDTH) return notFound();

    const item = await deps.metadata.getItem(id!);
    if (!item || item.type !== "file") return notFound();

    // Variant ready → stream it immutable (content-addressed by contentHash).
    if (item.contentHash) {
        const variant = await deps.variantStore.get(variantKey(item.contentHash, { width, format: "webp" }));
        if (variant) return imageResponse(variant, "image/webp", cacheControl(true));
    }

    // Fallback: the original, served NOT-immutable so it is replaced once the
    // worker has generated the variant.
    const original = await deps.sourceBlob.get(item.id);
    if (!original) return notFound();
    return imageResponse(original, item.mimeType, cacheControl(false), item.size);
}

/** Immutable for a ready variant (prod); always revalidate in dev and for the
 *  original fallback (the variant will supersede it). */
function cacheControl(variantReady: boolean): string {
    if (!variantReady || process.env.MODE === "DEV") return "no-cache, must-revalidate";
    return "public, max-age=31536000, immutable";
}

function imageResponse(body: ReadableStream<Uint8Array>, contentType: string, cache: string, length?: number): Response {
    const headers: Record<string, string> = {
        "Content-Type":           contentType,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control":          cache,
    };
    if (length !== undefined) headers["Content-Length"] = String(length);
    return new Response(body, { headers });
}

/** Mount `<basePath>/.cms/img/<id>/<width>.webp` (public, Delivery-only). */
export function registerImageVariantEndpoint(opts: {
    runner:       Runner;
    metadata:     CmsFilesMetadataRepository;
    sourceBlob:   CmsFilesBlobStore;
    variantStore: CmsFilesBlobStore;
}): void {
    const base   = opts.runner.basePath === "/" ? "" : opts.runner.basePath;
    const prefix = `${base}/.cms/img/`;
    opts.runner.group("/.cms/img", (imgRunner) => {
        imgRunner.setDefaultEndpoint("GET", (req) => serveVariantRequest(
            { metadata: opts.metadata, sourceBlob: opts.sourceBlob, variantStore: opts.variantStore }, req, { prefix }));
    });
}
