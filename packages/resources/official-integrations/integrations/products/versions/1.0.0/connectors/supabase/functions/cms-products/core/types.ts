export type JsonRecord = Record<string, unknown>;

export type WriteSpec = {
    table: string;
    entityType: string;
    naturalKey: (row: JsonRecord) => JsonRecord | null;
    allowInsertWithId?: boolean;
};
