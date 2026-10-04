import { binaryRepresentationFingerprint, mediaTypeIssue, type Sha256Digest } from "@bernouy/binary-media";
import type { FileItem } from "cms-content/files/interfaces/CmsFilesMetadataRepository";

/** Browser-declared MIME is untrusted; known binary formats require matching bytes. */
export function assertFileMediaType(mediaType: string, bytes: Uint8Array): void {
    const issue = mediaTypeIssue(mediaType, bytes);
    if (issue) {
        throw Object.assign(new TypeError(issue), { status: 415 });
    }
}

export function fileRepresentationVersion(item: Pick<FileItem, "contentHash" | "mimeType" | "size">): string | null {
    if (!item.contentHash) {
        return null;
    }
    if (!/^[0-9a-f]{64}$/u.test(item.contentHash)) {
        return null;
    }
    return binaryRepresentationFingerprint({
        digest: `sha256:${item.contentHash}` as Sha256Digest,
        byteLength: item.size,
        mediaType: item.mimeType,
    });
}
