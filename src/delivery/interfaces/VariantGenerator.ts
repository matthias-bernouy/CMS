import type { VariantSpec } from "./VariantSpec";

export type GeneratedVariant = {
    /** Hex sha256 of `bytes`. Doubles as the assets-bucket file name. */
    hash: string;
    bytes: Uint8Array;
    /** MIME type to pass to the bucket. */
    contentType: string;
    /** Extension (with leading dot, e.g. `".webp"`) appended to `<hash>` for
     *  the bucket file name. */
    extension: string;
};

/**
 * Materializes the bytes for one variant. The builder calls `generate` only
 * after checking the assets bucket doesn't already hold the variant — but
 * implementations should remain idempotent: calling `generate` twice with
 * the same spec MUST return the same `hash`.
 *
 * Typical implementation: build a resize-on-demand URL via the underlying
 * media/CDN provider, fetch it, hash the response, return the bytes. No
 * image processing in-process — the storage backend already does it.
 */
export interface VariantGenerator {
    generate(spec: VariantSpec): Promise<GeneratedVariant>;
}
