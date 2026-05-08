import type { Credential } from "./Credential";

/**
 * Persistence contract for bearer credentials. Generic over the concrete
 * credential type so consumers can attach extra fields (e.g. a scope id)
 * and still benefit from typed reads.
 *
 * Implementations MUST persist `tokenHash` only — never store cleartext.
 */
export interface CredentialRepository<T extends Credential = Credential> {
    create(credential: T): Promise<void>;
    get(id: string): Promise<T | null>;
    /** Hot path for bearer auth. Caller has already hashed the cleartext. */
    getByTokenHash(tokenHash: string): Promise<T | null>;
    update(id: string, patch: Partial<Pick<Credential, "label" | "expiresAt" | "revokedAt">>): Promise<void>;
    delete(id: string): Promise<void>;
}
