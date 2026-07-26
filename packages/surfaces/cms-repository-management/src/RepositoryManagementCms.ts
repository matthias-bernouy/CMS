import { sha256Hex } from "@bernouy/cms-integration-packages";
import type { IntegrationRegistryPublisher } from "@bernouy/cms-integration-registry";
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
            return publicationErrorResponse(error);
        }
    }
}
