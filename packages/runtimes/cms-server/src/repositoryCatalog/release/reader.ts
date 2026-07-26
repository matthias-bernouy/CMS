import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import type { PublicRepositoryRelease } from "@bernouy/cms-repository";
import { RepositoryCatalogHttpTransport, type RepositoryHttpDocument } from "../transport";
import { parsePublicRepositoryRelease } from "./parser";

export type HttpRepositoryReleaseReaderConfig = Readonly<{
    baseUrl: string;
    fetch?: typeof fetch;
    timeoutMs: number;
    maxResponseBytes: number;
}>;

export class HttpRepositoryReleaseReader {
    private readonly transport: RepositoryCatalogHttpTransport;

    constructor(private readonly config: HttpRepositoryReleaseReaderConfig) {
        this.transport = new RepositoryCatalogHttpTransport(config);
    }

    async getDocument(kind: string, version: string): Promise<RepositoryHttpDocument<PublicRepositoryRelease> | null> {
        const identity = {
            kind: assertIntegrationPackageKind(kind),
            version: assertIntegrationPackageVersion(version),
        };
        const query = new URLSearchParams(identity);
        const document = await this.transport.getJson(
            `api/integrations/release?${query.toString()}`,
            this.config.maxResponseBytes,
        );
        return document ? { value: parsePublicRepositoryRelease(document.value, identity), etag: document.etag } : null;
    }
}
