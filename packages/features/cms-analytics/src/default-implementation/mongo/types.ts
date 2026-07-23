export type RollupDoc = {
    _id: string;
    metric: string;
    dim: string;
    key: string;
    bucket: Date;
    count: number;
    msSum?: number;
    msMax?: number;
    expiresAt: Date;
};

export type HllSketchDoc = {
    _id: string;
    day: Date;
    stripe: number;
    precision: number;
    registers: Record<string, number>;
    profileVersion: string;
    expiresAt: Date;
    finalizedAt?: Date;
};

export type ReferrerBucketDoc = {
    _id: string;
    bucket: Date;
    total: number;
    candidates: Array<{ key: string; count: number }>;
    saturated: boolean;
    revision: number;
    expiresAt: Date;
};
