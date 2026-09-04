import type { IntegrationDefinition } from "../../interfaces/Integration";
import { sanitizeUiDefinition } from "../parsing/definition/metadata/uiDefinition";

export function integrationRegistry(siteIntegrations: IntegrationDefinition[] = []): IntegrationDefinition[] {
    return siteIntegrations.map(sanitizeRegistryDefinition);
}

export function findIntegration(
    kind: string,
    siteIntegrations: IntegrationDefinition[] = [],
): IntegrationDefinition | null {
    const site = siteIntegrations.find((definition) => definition.kind === kind);
    if (site) {
        return sanitizeRegistryDefinition(site);
    }
    return null;
}

function sanitizeRegistryDefinition(definition: IntegrationDefinition): IntegrationDefinition {
    const ui = sanitizeUiDefinition(definition.ui);
    const { ui: _untrustedUi, ...base } = definition;
    return {
        ...base,
        ...(ui ? { ui } : {}),
    } as IntegrationDefinition;
}
