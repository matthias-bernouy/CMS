import type { ControlCms } from "cms-control/ControlCms";
import { reconcileSubmittedThemeSettings } from "@bernouy/cms-content";
import { invalidateGlobalStyleAndPages } from "cms-control/core/admin/server/cache/invalidation";
import type { SettingsUpdateDto } from "cms-control/core/validation/settings/parseUpdateDto";

/**
 * Persist a settings update. Generated theme variables are served at `/style`
 * with a content hash, and that hash is baked into every cached page's
 * `<link rel="stylesheet">`, so any system change has to invalidate
 * the style entry AND every cached page.
 */
export async function updateSettings(cms: ControlCms, dto: SettingsUpdateDto): Promise<void> {
    let update = dto;
    if (dto.theme) {
        const current = await cms.repository.getSystem();
        update = {
            ...dto,
            theme: reconcileSubmittedThemeSettings(current.theme, dto.theme, []),
        };
    }
    if (update.site) {
        const site = { ...update.site };
        for (const field of ["notFound", "forbidden", "serverError", "login"] as const) {
            const ref = site[field];
            if (!ref?.path) {
                continue;
            }
            const page = await cms.repository.getPage(ref.path);
            if (page) {
                site[field] = { id: page.id, path: page.path };
            }
        }
        update = { ...update, site };
    }
    await cms.repository.updateSystem(update);
    invalidateGlobalStyleAndPages(cms);
}
