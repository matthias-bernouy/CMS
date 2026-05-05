import type { ControlCms } from "src/control/ControlCms";
import type { PageLink } from "src/socle/interfaces/CmsRepository";
import type { TSystem } from "src/socle/interfaces/models";

export type SettingsResponse = {
    site:    TSystem["site"];
    editor:  TSystem["editor"];
    pages:   PageLink[];
    layoutCategories: string[];
};

/**
 * View-model for the admin Settings page. One round-trip returns the
 * full system record, the page links (path + title) for the 404/500
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
        site:    system.site,
        editor:  system.editor,
        pages,
        layoutCategories,
    };
}
