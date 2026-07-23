export type RollupDoc = {
    _id: string;
    metric: string;
    dim: string;
    key: string;
    bucket: Date;
    count: number;
    msSum?: number;
    msMax?: number;
};

export type SeenDoc = {
    _id: string;
    expiresAt: Date;
};
