import { composeThemeSettings, type PageLink, type TSystem } from "@bernouy/cms-content";
import type { ControlCms } from "cms-control/ControlCms";

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
    const [system, pages] = await Promise.all([cms.repository.getSystem(), cms.repository.getLinks()]);

    const site = { ...system.site };
    for (const field of ["notFound", "forbidden", "serverError", "login"] as const) {
        const ref = site[field];
        if (ref?.id) {
            const page = await cms.repository.getPageById(ref.id);
            if (page) {
                site[field] = { id: page.id, path: page.path };
            }
        }
    }
    return {
        site,
        theme: composeThemeSettings(system.theme, []),
        security: system.security,
        email: system.email,
        pages,
    };
}
