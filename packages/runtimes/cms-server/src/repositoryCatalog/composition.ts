import { RepositoryCatalogPageProvider } from "@bernouy/cms-repository/catalog";
import type { ProductionIntegrationServices } from "../runtime/integrations";
import { HttpRepositoryCatalogReader } from "./reader";

export function createProductionRepositoryCatalogProvider(
    integrations: Pick<
        ProductionIntegrationServices,
        "repositoryReadMode" | "repositoryUrl" | "publicRepositoryCatalog"
    >,
    fetchImpl?: typeof fetch,
): RepositoryCatalogPageProvider {
    return new RepositoryCatalogPageProvider(createProductionRepositoryCatalogReader(integrations, fetchImpl));
}

export function createProductionRepositoryCatalogReader(
    integrations: Pick<
        ProductionIntegrationServices,
        "repositoryReadMode" | "repositoryUrl" | "publicRepositoryCatalog"
    >,
    fetchImpl?: typeof fetch,
): HttpRepositoryCatalogReader {
    if (integrations.repositoryReadMode !== "global") {
        throw new Error("Repository management CMS requires P9R_INTEGRATION_REPOSITORY_URL");
    }
    return new HttpRepositoryCatalogReader({
        catalog: integrations.publicRepositoryCatalog,
        baseUrl: integrations.repositoryUrl,
        ...(fetchImpl ? { fetch: fetchImpl } : {}),
    });
}
