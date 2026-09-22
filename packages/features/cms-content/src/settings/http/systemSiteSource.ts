import { SYSTEM_SITE_ORGANIZATION_ENDPOINT_URN } from "@bernouy/cms-sources";
import { projectPublicSiteOrganization } from "cms-content/settings/core/publicOrganization";
import { ContentValidationError } from "cms-content/application/core/validation/errors";
import type { ContentReader } from "cms-content/application/interfaces/ContentReader";

type SystemSiteEndpoint = {
    urn: string;
    targetUrl: string;
};

export async function executeSiteSystemSourceEndpoint(
    repository: Pick<ContentReader, "getRenderingSettings">,
    endpoint: SystemSiteEndpoint,
): Promise<Response> {
    if (
        endpoint.urn !== SYSTEM_SITE_ORGANIZATION_ENDPOINT_URN ||
        endpoint.targetUrl !== "cms-system://site/organization"
    ) {
        throw new ContentValidationError("endpoint", `unsupported site system target for ${endpoint.urn}`);
    }
    const settings = await repository.getRenderingSettings();
    return Response.json(projectPublicSiteOrganization(settings), {
        headers: { "cache-control": "no-store" },
    });
}
