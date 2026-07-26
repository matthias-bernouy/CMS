import { sha256Hex } from "@bernouy/cms-integration-packages";
import {
    IntegrationRegistryVersionConflictError,
    type IntegrationRegistryPublisher,
} from "@bernouy/cms-integration-registry";
import type { Runner } from "@bernouy/http-runner";
import { publicationCreatedResponse, publicationErrorResponse } from "cms-repository-management/publicationResponses";
import {
    readIntegrationPackageUpload,
    type IntegrationPackageUploadOptions,
} from "cms-repository-management/packageUpload";

export const REPOSITORY_PUBLICATION_PATH = "/api/integrations/publications";

export type RepositoryManagementCmsConfig = Readonly<{
    runner: Runner;
    publisher: IntegrationRegistryPublisher;
    upload: IntegrationPackageUploadOptions;
    existingVersionDigest?: (kind: string, version: string) => string | null | Promise<string | null>;
}>;

export class RepositoryManagementCms {
    constructor(private readonly config: RepositoryManagementCmsConfig) {
        config.runner.post(REPOSITORY_PUBLICATION_PATH, (request) => this.publish(request));
    }

    private async publish(request: Request): Promise<Response> {
        try {
            const upload = await readIntegrationPackageUpload(request, this.config.upload);
            const digest = await sha256Hex(upload.canonicalBytes);
            const result = await this.config.publisher.publish({
                package: {
                    envelope: upload.envelope,
                    canonicalBytes: upload.canonicalBytes,
                    digest,
                },
            });
            return publicationCreatedResponse(result);
        } catch (error) {
            return publicationErrorResponse(error, await this.resolveExistingDigest(error));
        }
    }

    private async resolveExistingDigest(error: unknown): Promise<string | undefined> {
        if (!(error instanceof IntegrationRegistryVersionConflictError) || !this.config.existingVersionDigest) {
            return undefined;
        }
        try {
            const digest = await this.config.existingVersionDigest(error.kind, error.version);
            return digest && /^[a-f0-9]{64}$/u.test(digest) ? digest : undefined;
        } catch {
            return undefined;
        }
    }
}
