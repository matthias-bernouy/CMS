import type { SecretStore } from "@bernouy/secret-store";
import { CmsSecrets } from "cms-secrets/core/CmsSecrets";
import { CmsSecretConflict } from "cms-secrets/core/errors";

const MAX_NAMESPACE_KEYS = 10_000;
const MAX_WRITE_ATTEMPTS = 3;

export type CmsSecretNamespaceCredentials = Readonly<{
    namespaceId: string;
    namespaceKey: string;
}>;

/** Presents one CMS Secrets namespace as the generic named-secret port. */
export class CmsSecretNamespaceStore implements SecretStore {
    constructor(
        private readonly secrets: CmsSecrets,
        private readonly credentials: CmsSecretNamespaceCredentials,
    ) {}

    async get(key: string): Promise<string | null> {
        const metadata = await this.metadata(key);
        if (!metadata) {
            return null;
        }
        return (
            await this.secrets.resolve(this.credentials.namespaceId, this.credentials.namespaceKey, metadata.secretId)
        ).value;
    }

    async set(key: string, value: string): Promise<void> {
        for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
            const metadata = await this.metadata(key);
            try {
                if (!metadata) {
                    await this.secrets.create(this.credentials.namespaceId, this.credentials.namespaceKey, key, value);
                } else {
                    await this.secrets.rotate(
                        this.credentials.namespaceId,
                        this.credentials.namespaceKey,
                        metadata.secretId,
                        metadata.version,
                        value,
                    );
                }
                return;
            } catch (error) {
                if (!(error instanceof CmsSecretConflict) || attempt === MAX_WRITE_ATTEMPTS - 1) {
                    throw error;
                }
            }
        }
    }

    async delete(key: string): Promise<void> {
        const metadata = await this.metadata(key);
        if (metadata) {
            await this.secrets.delete(
                this.credentials.namespaceId,
                this.credentials.namespaceKey,
                metadata.secretId,
                metadata.version,
            );
        }
    }

    async listKeys(): Promise<string[]> {
        return (
            await this.secrets.list(this.credentials.namespaceId, this.credentials.namespaceKey, MAX_NAMESPACE_KEYS)
        ).map(({ name }) => name);
    }

    private metadata(key: string) {
        return this.secrets.getByName(this.credentials.namespaceId, this.credentials.namespaceKey, key);
    }
}
