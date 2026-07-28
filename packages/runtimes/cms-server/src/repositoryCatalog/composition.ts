import type { ProductionIntegrationServices } from "../runtime/integrations";
import { HttpRepositoryCatalogReader } from "./reader";

export function createProductionRepositoryCatalogReader(
    integrations: Pick<ProductionIntegrationServices, "repositoryUrl" | "integrationCatalog">,
    fetchImpl?: typeof fetch,
): HttpRepositoryCatalogReader {
    return new HttpRepositoryCatalogReader({
        catalog: integrations.integrationCatalog,
        baseUrl: integrations.repositoryUrl,
        ...(fetchImpl ? { fetch: fetchImpl } : {}),
    });
}
