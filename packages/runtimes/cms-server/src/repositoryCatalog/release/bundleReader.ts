import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    computeIntegrationVerificationDigest,
    validateIntegrationVerificationEnvelope,
} from "@bernouy/cms-integration-verification";
import { IntegrationRepositoryContractError } from "@bernouy/cms-integrations";
import { RepositoryCatalogHttpTransport } from "../transport";

const SHA256 = /^[a-f0-9]{64}$/u;

export type HttpRepositoryVerificationBundleReaderConfig = Readonly<{
    baseUrl: string;
    fetch?: typeof fetch;
    timeoutMs: number;
    maxResponseBytes: number;
}>;

export class HttpRepositoryVerificationBundleReader {
    private readonly transport: RepositoryCatalogHttpTransport;

    constructor(private readonly config: HttpRepositoryVerificationBundleReaderConfig) {
        this.transport = new RepositoryCatalogHttpTransport(config);
    }

    async get(digest: string) {
        if (!SHA256.test(digest)) {
            throw new TypeError("Verification bundle digest must be lowercase SHA-256");
        }
        const query = new URLSearchParams({ digest });
        const document = await this.transport.getJson(
            `api/integrations/verification-bundle?${query.toString()}`,
            this.config.maxResponseBytes,
        );
        if (!document) {
            return null;
        }
        try {
            const envelope = validateIntegrationVerificationEnvelope(document.value);
            const actualDigest = await computeIntegrationVerificationDigest(envelope);
            if (actualDigest !== digest || document.etag !== digest) {
                throw new IntegrationRepositoryContractError();
            }
            return { envelope, canonicalBytes: canonicalJsonBytes(envelope), digest };
        } catch (error) {
            if (error instanceof IntegrationRepositoryContractError) {
                throw error;
            }
            throw new IntegrationRepositoryContractError();
        }
    }
}
