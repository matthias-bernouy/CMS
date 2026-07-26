import type { ThemeSource } from "@bernouy/cms-content";

type IntegrationThemeSource = ThemeSource & { owner: { kind: "integration"; integrationId: string } };
type SiteThemeSource = ThemeSource & { owner: { kind: "site" } };

export function integrationOwnerId(source: ThemeSource | undefined): string | undefined {
    const owner = source?.owner;
    return owner?.kind === "integration" ? owner.integrationId : undefined;
}

export function isIntegrationSource(source: ThemeSource | undefined): source is IntegrationThemeSource {
    return integrationOwnerId(source) !== undefined;
}

export function isSiteTokenSource(source: ThemeSource | undefined): source is SiteThemeSource {
    return source?.owner?.kind === "site" && !["custom", "existing-css", "imported-css", "other"].includes(source.id);
}

export function isImportedCssSource(source: ThemeSource | undefined): source is SiteThemeSource {
    return source?.owner?.kind === "site" && ["custom", "existing-css", "imported-css", "other"].includes(source.id);
}
