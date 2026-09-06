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

/** Repository collections and installed snapshots share one discoverable catalogue. */
export async function exploreLibraryCollections(
    cms: ControlCms,
    installations: IntegrationInstallation[],
    basePath: string,
    search = "",
    visibility = "",
) {
    const definitions = await listIntegrationDefinitions(cms.integrationCatalog);
    const catalogue = new Map(
        definitions
            .filter((definition) => definition.type === "collection")
            .map((definition) => [definition.kind, definition]),
    );
    for (const installation of installations) {
        const definition = installation.definitionSnapshot;
        if (definition?.type === "collection") {
            catalogue.set(definition.kind, definition);
        }
    }
    const query = search.trim().toLowerCase();
    return [...catalogue.values()]
        .sort((a, b) => a.label.localeCompare(b.label))
        .flatMap((definition) => {
            const installation = installations.find((item) => item.definitionSnapshot?.kind === definition.kind);
            const imported = Boolean(installation);
            if ((visibility === "imported" && !imported) || (visibility === "available" && imported)) {
                return [];
            }
            if (
                query &&
                ![definition.label, definition.kind, definition.description ?? ""].some((value) =>
                    value.toLowerCase().includes(query),
                )
            ) {
                return [];
            }
            return [
                {
                    kind: definition.kind,
                    label: definition.label,
                    description: definition.description ?? "",
                    category: definition.category ?? "Other",
                    version: installation?.definitionVersion ?? definition.version,
                    resourceCount:
                        definition.type === "collection" ? collectionSelectableResources(definition).length : 0,
                    ...collectionAssets(basePath, definition, installation?.definitionVersion ?? definition.version),
                    imported,
                    canImport: !imported,
                    ...(installation
                        ? {
                              href: `${basePath}/admin/blocs?collection=${encodeURIComponent(`managed:${installation.id}`)}`,
                          }
                        : {}),
                },
            ];
        });
}
