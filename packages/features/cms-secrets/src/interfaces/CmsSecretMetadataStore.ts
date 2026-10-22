import type {
    CmsSecretMetadata,
    SecretNamespaceKeyRecord,
    SecretNamespaceRecord,
} from "cms-secrets/interfaces/CmsSecret";

export interface CmsSecretMetadataStore {
    createNamespace(namespace: SecretNamespaceRecord, key: SecretNamespaceKeyRecord): Promise<void>;
    getNamespace(id: string): Promise<SecretNamespaceRecord | null>;
    deleteNamespace(id: string): Promise<void>;
    getNamespaceKey(id: string): Promise<SecretNamespaceKeyRecord | null>;
    putNamespaceKey(key: SecretNamespaceKeyRecord): Promise<void>;
    get(id: string): Promise<CmsSecretMetadata | null>;
    findByName(namespaceId: string, name: string): Promise<CmsSecretMetadata | null>;
    list(namespaceId: string, limit: number): Promise<readonly CmsSecretMetadata[]>;
    create(secret: CmsSecretMetadata): Promise<boolean>;
    replace(secret: CmsSecretMetadata, expectedVersion: number): Promise<boolean>;
    delete(id: string, expectedVersion: number): Promise<boolean>;
}
