import type { IntegrationThemeContribution } from "@bernouy/cms-content";
import type { IntegrationInstallation } from "../../interfaces/IntegrationInstallation";

/**
 * Read the trusted Theme catalogs carried by successful installation
 * snapshots. Repository definitions and failed or pending attempts never
 * affect the live site Theme.
 */
export function collectIntegrationInstallationThemeContributions(
    installations: Iterable<IntegrationInstallation>,
): IntegrationThemeContribution[] {
    const contributions: IntegrationThemeContribution[] = [];
    for (const installation of installations) {
        const snapshot = installation.definitionSnapshot;
        if (installation.status !== "success" || !snapshot?.theme || snapshot.theme.categories.length === 0) {
            continue;
        }
        contributions.push({
            integrationId: installation.id,
            label: snapshot.label,
            ...(snapshot.theme.dependencies?.length || snapshot.dependencies?.length
                ? {
                      dependencies: [
                          ...new Set([
                              ...(snapshot.theme.dependencies ?? []).map(({ kind }) => kind),
                              ...(snapshot.dependencies ?? []).map(({ kind }) => kind),
                          ]),
                      ].sort(compareText),
                  }
                : {}),
            categories: structuredClone(snapshot.theme.categories),
        });
    }
    return contributions.sort((left, right) => compareText(left.integrationId, right.integrationId));
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
