import { SYSTEM_SITE_ORGANIZATION_ENDPOINT_URN } from "@bernouy/cms-sources";
import { projectPublicSiteOrganization } from "cms-content/core/queries/publicOrganization";
import { ContentValidationError } from "cms-content/core/validation/errors";
import type { ContentReader } from "cms-content/interfaces/ContentReader";

type SystemSiteEndpoint = {
    urn: string;
    targetUrl: string;
};

export async function executeSiteSystemSourceEndpoint(
    repository: ContentReader,
    endpoint: SystemSiteEndpoint,
): Promise<Response> {
    if (
        endpoint.urn !== SYSTEM_SITE_ORGANIZATION_ENDPOINT_URN ||
        endpoint.targetUrl !== "cms-system://site/organization"
    ) {
        throw new ContentValidationError("endpoint", `unsupported site system target for ${endpoint.urn}`);
    }
    const settings = await repository.getSystem();
    return Response.json(projectPublicSiteOrganization(settings), {
        headers: { "cache-control": "no-store" },
    });
}
