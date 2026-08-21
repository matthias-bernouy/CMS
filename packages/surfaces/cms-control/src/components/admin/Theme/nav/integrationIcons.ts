import type { IntegrationDefinition } from "@bernouy/cms-integrations";
import type { ThemeSource } from "@bernouy/cms-content";

import { getIntegrationInstallation } from "../../Resources/Integrations/api";

export async function loadIntegrationThemeIcons(
    sources: ThemeSource[],
): Promise<ReadonlyMap<string, IntegrationDefinition>> {
    const integrationIds = Array.from(
        new Set(
            sources.flatMap((source) => (source.owner?.kind === "integration" ? [source.owner.integrationId] : [])),
        ),
    );
    const definitions = await Promise.all(
        integrationIds.map(async (integrationId) => {
            try {
                const installation = await getIntegrationInstallation(integrationId);
                return installation.definition ? ([integrationId, installation.definition] as const) : undefined;
            } catch {
                return undefined;
            }
        }),
    );
    return new Map(definitions.filter((entry) => entry !== undefined));
}
