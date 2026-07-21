import type { ControlCms } from "cms-control/ControlCms";
import { listIntegrationDefinitions } from "cms-control/core/integrations/definitions";
import { buildIntegrationCatalogue } from "cms-control/core/integrations/catalogue";

export default async function getIntegrationCatalogue(req: Request, cms: ControlCms): Promise<Response> {
    const url = new URL(req.url);
    const definitions = await listIntegrationDefinitions(cms.integrationCatalog);
    const installations = await cms.integrationInstallations.list();
    return Response.json(
        buildIntegrationCatalogue({
            definitions,
            installations,
            query: url.searchParams.get("q") ?? "",
            category: url.searchParams.get("category") ?? "",
            basePath: basePathFromRequest(url),
        }),
    );
}

function basePathFromRequest(url: URL): string {
    const suffix = "/api/integrations/catalogue";
    return url.pathname.endsWith(suffix) ? url.pathname.slice(0, -suffix.length) : "";
}
