import { composeThemeSettings, type PageLink, type TSystem } from "@bernouy/cms-content";
import type { ControlCms } from "cms-control/ControlCms";
import { getInstalledIntegrationThemeContributions } from "cms-control/core/management/integrations/themeContributions";

export type SettingsResponse = {
    site: TSystem["site"];
    theme: TSystem["theme"];
    security: TSystem["security"];
    email: TSystem["email"];
    pages: PageLink[];
};

/**
 * View-model for the admin Settings page. One round-trip returns the
 * full system record and the page links (path + title) for the system-page
 * selects. Each repository call is narrow on purpose, so settings do not load
 * complete page documents.
 */
export async function getSettings(cms: ControlCms): Promise<SettingsResponse> {
    const [system, pages, themeContributions] = await Promise.all([
        cms.repository.getSystem(),
        cms.repository.getLinks(),
        getInstalledIntegrationThemeContributions(cms.configuredIntegrationInstallations),
    ]);

    return {
        site: system.site,
        theme: composeThemeSettings(system.theme, themeContributions),
        security: system.security,
        email: system.email,
        pages,
    };
}
