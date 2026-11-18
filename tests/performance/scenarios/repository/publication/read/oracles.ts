import { assertCondition, requireRecord } from "../../../queries/types";

export function assertPublicationBytes(actual: unknown, expected: Uint8Array) {
    assertCondition(
        actual instanceof Uint8Array && Buffer.from(actual).equals(Buffer.from(expected)),
        "publication-read-immutable-bytes",
    );
}
export function assertPublicationSource(actual: unknown, sourceJson: string, digest: string) {
    const row = requireRecord(actual);
    assertCondition(row.sourceJson === sourceJson && row.releaseDigest === digest, "publication-read-immutable-source");
}
export function assertPublicationState(actual: unknown, revision: number, reason: string | null) {
    const row = requireRecord(actual);
    assertCondition(row.revision === revision, "publication-read-state-revision");
    if (reason === null) {
        assertCondition(row.yank === null, "publication-read-unexpected-yank");
    } else {
        const yank = requireRecord(row.yank);
        assertCondition(
            yank.reason === reason && typeof yank.yankedAt === "string" && Number.isFinite(Date.parse(yank.yankedAt)),
            "publication-read-stale-yank",
        );
    }
}
export function assertUploadProgress(
    actual: unknown,
    uploadId: unknown,
    expiresAt: unknown,
    assetIds: readonly string[],
) {
    const row = requireRecord(actual);
    assertCondition(
        row.uploadId === uploadId &&
            row.expiresAt === expiresAt &&
            Array.isArray(row.uploadedAssetIds) &&
            JSON.stringify(row.uploadedAssetIds) === JSON.stringify(assetIds),
        "publication-read-upload-progress",
    );
}
export function assertCollectionPreflight(actual: unknown, digest: string) {
    const row = requireRecord(actual);
    assertCondition(row.complete === true && row.digest === digest, "publication-read-preflight-stale");
}
