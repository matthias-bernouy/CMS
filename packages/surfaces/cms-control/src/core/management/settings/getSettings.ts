import { composeThemeSettings, type PageLink, type TSystem } from "@bernouy/cms-content";
import type { ControlCms } from "cms-control/ControlCms";
import { getInstalledIntegrationThemeContributions } from "cms-control/core/management/integrations/themeContributions";

export type SettingsResponse = {
    site: TSystem["site"];
    editor: TSystem["editor"];
    theme: TSystem["theme"];
    security: TSystem["security"];
    email: TSystem["email"];
    pages: PageLink[];
    layoutCategories: string[];
};

/**
 * View-model for the admin Settings page. One round-trip returns the
 * full system record, the page links (path + title) for the system-page
 * selects, and the unique sorted template categories for the layout
 * select. Each repository call is narrow on purpose — no `getAllPages`
 * or `getAllTemplates` paying for fields the form never reads.
 */
export async function getSettings(cms: ControlCms): Promise<SettingsResponse> {
    const [system, pages, layoutCategories, themeContributions] = await Promise.all([
        cms.repository.getSystem(),
        cms.repository.getLinks(),
        cms.repository.getTemplateCategories(),
        getInstalledIntegrationThemeContributions(cms.configuredIntegrationInstallations),
    ]);

    return {
        site: system.site,
        editor: system.editor,
        theme: composeThemeSettings(system.theme, themeContributions),
        security: system.security,
        email: system.email,
        pages,
        layoutCategories,
    };
}
