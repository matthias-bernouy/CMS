import type { ControlCms } from "cms-control/ControlCms";
import type { PageLink } from "@bernouy/cms-content";
import type { TSystem } from "@bernouy/cms-content";

export type SettingsResponse = {
    site:     TSystem["site"];
    editor:   TSystem["editor"];
    theme:    TSystem["theme"];
    security: TSystem["security"];
    email:    TSystem["email"];
    pages:    PageLink[];
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
    const [system, pages, layoutCategories] = await Promise.all([
        cms.repository.getSystem(),
        cms.repository.getLinks(),
        cms.repository.getTemplateCategories(),
    ]);

    return {
        site:     system.site,
        editor:   system.editor,
        theme:    system.theme,
        security: system.security,
        email:    system.email,
        pages,
        layoutCategories,
    };
}
