export interface OAuthRecord {
    readonly id: string;
    readonly revision: number;
    readonly value: unknown;
    readonly expiresAt: number;
}

/** Atomic compare-and-swap is required for codes, refresh rotation and revocation. */
export interface OAuthStore {
    get(id: string): Promise<OAuthRecord | null>;
    create(record: OAuthRecord): Promise<void>;
    replace(record: OAuthRecord, expectedRevision: number): Promise<boolean>;
    list(
        prefix: string,
        limit: number,
        subjectId?: string,
        options?: { after?: string; expiresAfter?: number },
    ): Promise<readonly OAuthRecord[]>;
    pruneExpired(now: number): Promise<void>;
}

export interface OAuthClient {
    readonly clientId: string;
    readonly name: string;
    readonly redirectUris: readonly string[];
}

export interface OAuthRequest {
    readonly clientId: string;
    readonly redirectUri: string;
    readonly resource: string;
    readonly challenge: string;
    readonly state: string;
}

export interface OAuthGrant extends OAuthRequest {
    readonly subjectId: string;
    readonly clientName: string;
    readonly createdAt: number;
    readonly refreshHash: string;
    readonly previousRefreshHashes: readonly string[];
    readonly revoked: boolean;
}

export interface OAuthPolicy {
    canConnect(subjectId: string): Promise<boolean>;
}
