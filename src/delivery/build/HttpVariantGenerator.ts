import type { VariantGenerator, GeneratedVariant } from "src/delivery/interfaces/VariantGenerator";
import type { VariantSpec, VariantImageFormat } from "src/delivery/interfaces/VariantSpec";
import { sha256Hex } from "src/delivery/build/sha256";

export type VariantUrlBuilder = (
    originalUrl: string,
    width: number,
    format?: VariantImageFormat,
) => string;

export type HttpVariantGeneratorOptions = {
    /** Map a `VariantSpec` to a fetchable URL. Typically wraps the media
     *  provider's `formatImageUrl(...)` — the URL points at the resize
     *  backend, which returns the rendered bytes. */
    buildVariantUrl: VariantUrlBuilder;
    /** Override the global `fetch` (tests, custom retry / auth wrappers). */
    fetchFn?: typeof fetch;
};

/**
 * Concrete `VariantGenerator` that fetches the rendered variant bytes from
 * a resize backend and hashes them. Provider-agnostic — the actual URL
 * shape (query params, signing, …) is encapsulated in `buildVariantUrl`,
 * supplied by the consumer.
 */
export class HttpVariantGenerator implements VariantGenerator {
    constructor(private _opts: HttpVariantGeneratorOptions) {}

    async generate(spec: VariantSpec): Promise<GeneratedVariant> {
        const url = this._opts.buildVariantUrl(spec.originalUrl, spec.width, spec.format);
        const fetchFn = this._opts.fetchFn ?? fetch;
        const res = await fetchFn(url);
        if (!res.ok) {
            throw new Error(`Failed to fetch variant ${url}: ${res.status} ${res.statusText}`);
        }
        const bytes = new Uint8Array(await res.arrayBuffer());
        const hash  = await sha256Hex(bytes);
        const contentType = res.headers.get("content-type")?.split(";")[0]?.trim()
            ?? guessContentTypeFromUrl(url)
            ?? "application/octet-stream";
        return {
            hash,
            bytes,
            contentType,
            extension: extensionFromContentType(contentType),
        };
    }
}

function extensionFromContentType(ct: string): string {
    switch (ct.toLowerCase()) {
        case "image/jpeg": return ".jpg";
        case "image/png":  return ".png";
        case "image/webp": return ".webp";
        case "image/avif": return ".avif";
        case "image/gif":  return ".gif";
        case "image/svg+xml": return ".svg";
        default:           return ".bin";
    }
}

function guessContentTypeFromUrl(url: string): string | null {
    const path = url.split(/[?#]/)[0]!.toLowerCase();
    if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
    if (path.endsWith(".png"))  return "image/png";
    if (path.endsWith(".webp")) return "image/webp";
    if (path.endsWith(".avif")) return "image/avif";
    if (path.endsWith(".gif"))  return "image/gif";
    if (path.endsWith(".svg"))  return "image/svg+xml";
    return null;
}
