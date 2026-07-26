import type { IntegrationThemeContribution } from "@bernouy/cms-content";
import {
    collectIntegrationInstallationThemeContributions,
    type IntegrationInstallationRepository,
} from "@bernouy/cms-integrations";

export async function getInstalledIntegrationThemeContributions(
    installations: IntegrationInstallationRepository | null | undefined,
): Promise<IntegrationThemeContribution[]> {
    return installations ? collectIntegrationInstallationThemeContributions(await installations.list()) : [];
}
