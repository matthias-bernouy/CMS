export type RelationPageRequest = {
    limit?: number;
    offset?: number;
    cursor?: string;
};

export type RelationPageResult = {
    items: unknown[];
    total?: number;
    limit: number;
    offset?: number;
    nextCursor?: string;
};

export type NormalizedPageRequest = {
    limit: number;
    offset?: number;
    cursor?: string;
    offsetApplied: boolean;
};
