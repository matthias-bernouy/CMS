import type { ThemeSource } from "@bernouy/cms-content";

type IntegrationThemeSource = ThemeSource & { owner: { kind: "integration"; integrationId: string } };

export function integrationOwnerId(source: ThemeSource | undefined): string | undefined {
    const owner = source?.owner;
    return owner?.kind === "integration" ? owner.integrationId : undefined;
}

export function isIntegrationSource(source: ThemeSource | undefined): source is IntegrationThemeSource {
    return integrationOwnerId(source) !== undefined;
}

export function isThemeCatalogEditable(source: ThemeSource | undefined): source is ThemeSource {
    return Boolean(source) && !isIntegrationSource(source);
}
