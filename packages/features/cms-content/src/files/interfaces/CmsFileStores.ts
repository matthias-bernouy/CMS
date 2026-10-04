import type { BlobDeleter, BlobReader, BlobWriter } from "@bernouy/blob-store";

/** Writable derivative store used by the image optimization pipeline. */
export interface VariantStore extends BlobReader, BlobWriter {}

/** Writable and replaceable store used by sitemap materialization. */
export interface SitemapStore extends BlobReader, BlobWriter, BlobDeleter {}
