import type { ThemeSource } from "@bernouy/cms-content";

export function integrationOwnerId(source: ThemeSource | undefined): string | undefined {
    const owner = source?.owner;
    return owner?.kind === "integration" ? owner.integrationId : undefined;
}

export function isIntegrationSource(source: ThemeSource | undefined): boolean {
    return integrationOwnerId(source) !== undefined;
}
