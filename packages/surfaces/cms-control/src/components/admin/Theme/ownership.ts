import type { ThemeSource } from "@bernouy/cms-content";

type IntegrationThemeSource = ThemeSource & { owner: { kind: "integration"; integrationId: string } };

export function isIntegrationSource(source: ThemeSource | undefined): source is IntegrationThemeSource {
    return source?.owner?.kind === "integration";
}

export function isThemeCatalogEditable(source: ThemeSource | undefined): source is ThemeSource {
    return Boolean(source) && !isIntegrationSource(source);
}
