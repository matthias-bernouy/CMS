export type DiskRecord = {
    schema: "cms.provider-image.v1";
    byteDigest: string;
    etag: string;
    width: number;
    height: number;
    size: number;
    createdAt: number;
};

export function keyName(key: string): string {
    if (!/^sha256:[a-f0-9]{64}$/.test(key)) {
        throw new TypeError("provider derivative key is invalid");
    }
    return key.slice(7);
}

export function parseRecord(value: unknown): DiskRecord | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    const record = value as Partial<DiskRecord>;
    return record.schema === "cms.provider-image.v1" &&
        typeof record.byteDigest === "string" &&
        /^sha256:[a-f0-9]{64}$/.test(record.byteDigest) &&
        record.etag === `"${record.byteDigest}"` &&
        Number.isSafeInteger(record.width) &&
        Number(record.width) > 0 &&
        Number.isSafeInteger(record.height) &&
        Number(record.height) > 0 &&
        Number.isSafeInteger(record.size) &&
        Number(record.size) >= 0 &&
        typeof record.createdAt === "number" &&
        Number.isFinite(record.createdAt) &&
        record.createdAt >= 0
        ? (record as DiskRecord)
        : null;
}
