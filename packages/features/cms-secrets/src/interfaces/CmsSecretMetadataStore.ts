import type { CmsSecretMetadata } from "cms-secrets/interfaces/CmsSecret";

export interface CmsSecretMetadataStore {
    get(id: string): Promise<CmsSecretMetadata | null>;
    findByName(name: string): Promise<CmsSecretMetadata | null>;
    list(limit: number): Promise<readonly CmsSecretMetadata[]>;
    create(secret: CmsSecretMetadata): Promise<boolean>;
    replace(secret: CmsSecretMetadata, expectedVersion: number): Promise<boolean>;
    delete(id: string, expectedVersion: number): Promise<boolean>;
}
