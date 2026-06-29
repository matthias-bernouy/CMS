import type { IntegrationDefinition } from "../interfaces/Integration";
import { BUILT_IN_INTEGRATIONS } from "../built-in";
import { sanitizeUiDefinition } from "./parsing/uiDefinition";

export function integrationRegistry(siteIntegrations: IntegrationDefinition[] = []): IntegrationDefinition[] {
    const siteKinds = new Set(siteIntegrations.map(definition => definition.kind));
    return [
        ...siteIntegrations.map(sanitizeRegistryDefinition),
        ...BUILT_IN_INTEGRATIONS.filter(definition => !siteKinds.has(definition.kind)).map(sanitizeRegistryDefinition),
    ];
}

export function findIntegration(
    kind: string,
    siteIntegrations: IntegrationDefinition[] = [],
): IntegrationDefinition | null {
    const site = siteIntegrations.find(definition => definition.kind === kind);
    if (site) return sanitizeRegistryDefinition(site);
    const bundled = BUILT_IN_INTEGRATIONS.find(definition => definition.kind === kind);
    if (bundled) return sanitizeRegistryDefinition(bundled);
    return null;
}

function sanitizeRegistryDefinition(definition: IntegrationDefinition): IntegrationDefinition {
    const ui = sanitizeUiDefinition(definition.ui);
    return {
        ...definition,
        ...(ui ? { ui } : { ui: undefined }),
    };
}
