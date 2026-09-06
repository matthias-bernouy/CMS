import type { ControlCms } from "cms-control/ControlCms";
import type { IntegrationInstallation } from "@bernouy/cms-integrations";
import { collectionSelectableResources } from "@bernouy/cms-integrations/resources";
import { listIntegrationDefinitions } from "cms-control/core/management/integrations/definitions";
import { buildIntegrationCatalogue } from "cms-control/core/management/integrations/presentation/catalogue";
import { collectionAssets } from "./assets";
import type { AvailableLibraryCollection } from "./types";

export async function availableLibraryCollections(
    cms: ControlCms,
    installations: IntegrationInstallation[],
    basePath: string,
    search = "",
): Promise<AvailableLibraryCollection[]> {
    const definitions = await listIntegrationDefinitions(cms.integrationCatalog);
    const catalogue = buildIntegrationCatalogue({
        definitions,
        installations,
        scope: "collections",
        query: search,
        category: "",
        basePath,
    });
    return catalogue.items.map((item) => {
        const definition = definitions.find(({ kind }) => kind === item.kind)!;
        return {
            kind: item.kind,
            label: item.label,
            description: item.description,
            category: item.category,
            version: definition.version,
            ...collectionAssets(basePath, definition),
            resourceCount: definition.type === "collection" ? collectionSelectableResources(definition).length : 0,
            canImport: definition.type === "collection",
        };
    });
}
