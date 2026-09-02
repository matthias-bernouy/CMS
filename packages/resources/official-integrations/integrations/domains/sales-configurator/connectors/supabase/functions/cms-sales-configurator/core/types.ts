export type JsonRecord = Record<string, unknown>;

export interface Page<T = unknown> {
    items: T[];
    nextCursor: string | null;
}

export interface PartnerAccount {
    id: number;
    cmsUserId: string;
    displayName: string;
}
