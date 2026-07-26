import type { ControlCms } from "cms-control/ControlCms";
import { reconcileSubmittedThemeSettings } from "@bernouy/cms-content";
import { invalidateGlobalStyleAndPages } from "cms-control/core/admin/server/cache/invalidation";
import { getInstalledIntegrationThemeContributions } from "cms-control/core/management/integrations/themeContributions";
import type { SettingsUpdateDto } from "cms-control/core/validation/settings/parseUpdateDto";

/**
 * Persist a settings update. Theme CSS is served at `/style` keyed by
 * its content hash, and that hash is baked into every cached page's
 * `<link rel="stylesheet">`, so any system change has to invalidate
 * the style entry AND every cached page.
 */
export async function updateSettings(cms: ControlCms, dto: SettingsUpdateDto): Promise<void> {
    let update = dto;
    if (dto.theme) {
        const [current, contributions] = await Promise.all([
            cms.repository.getSystem(),
            getInstalledIntegrationThemeContributions(cms.configuredIntegrationInstallations),
        ]);
        update = {
            ...dto,
            theme: reconcileSubmittedThemeSettings(current.theme, dto.theme, contributions),
        };
    }
    await cms.repository.updateSystem(update);
    invalidateGlobalStyleAndPages(cms);
}
