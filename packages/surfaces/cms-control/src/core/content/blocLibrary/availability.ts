import { updateCollectionAvailability, type IntegrationInstallation } from "@bernouy/cms-integrations";
import type { ControlCms } from "cms-control/ControlCms";
import {
    installedIntegrationDefinition,
    installedIntegrationDefinitions,
} from "cms-control/core/management/integrations/definitions";

export async function saveCollectionAvailability(cms: ControlCms, id: string, body: Record<string, unknown>) {
    const definitions = await installedIntegrationDefinitions(
        cms.integrationCatalog,
        cms.integrationInstallations,
        cms.integrationPackageResolver,
    );
    return updateCollectionAvailability(
        cms.integrationInstallations,
        cms.integrationBlocRepository ?? cms.repository,
        id,
        body,
        {
            definition: definitions.find(({ kind }) => kind === id),
            installedDefinitions: definitions,
        },
    );
}

export async function resolvedCollectionInstallations(
    cms: ControlCms,
    installations: IntegrationInstallation[],
): Promise<IntegrationInstallation[]> {
    return Promise.all(
        installations.map(async (installation) => {
            if (installation.status !== "success" || installation.definitionSnapshot) {
                return installation;
            }
            try {
                const definition = await installedIntegrationDefinition(
                    cms.integrationCatalog,
                    installation,
                    cms.integrationPackageResolver,
                );
                return definition?.schema === "cms.integration.definition.v2" && definition.type === "collection"
                    ? { ...installation, definitionSnapshot: definition }
                    : installation;
            } catch {
                return installation;
            }
        }),
    );
}
