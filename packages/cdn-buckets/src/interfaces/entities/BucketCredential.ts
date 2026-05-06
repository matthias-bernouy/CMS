/** Several credentials per bucket are allowed (rotation, dev/prod separation).
 *  Only the hash is persisted — the cleartext is returned exactly once at
 *  creation and never reconstructible afterwards. */
export type BucketCredential = {
    id: string;
    bucketId: string;
    /** Hex-encoded SHA-256 of the cleartext bearer token. */
    tokenHash: string;
    label?: string;
    createdAt: Date;
    expiresAt?: Date;
    revokedAt?: Date;
};
