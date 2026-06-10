import type { ControlCms } from "cms-control/ControlCms";
import { P9R_CACHE } from "@bernouy/cms-shared";
import { invalidateAllPages } from "cms-control/core/server/cache/invalidation";
import type { SettingsUpdateDto } from "cms-control/core/validation/settings/parseUpdateDto";

/**
 * Persist a settings update. Theme CSS is served at `/style` keyed by
 * its content hash, and that hash is baked into every cached page's
 * `<link rel="stylesheet">`, so any system change has to invalidate
 * the style entry AND every cached page.
 */
export async function updateSettings(cms: ControlCms, dto: SettingsUpdateDto): Promise<void> {
    await cms.repository.updateSystem(dto);
    cms.cache.delete(P9R_CACHE.STYLE);
    invalidateAllPages(cms);
}
