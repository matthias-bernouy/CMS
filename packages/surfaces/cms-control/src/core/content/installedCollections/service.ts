import type { ControlCms } from "cms-control/ControlCms";
import { invalidateGlobalStyleAndPages } from "cms-control/core/admin/server/cache/invalidation";
export function collectionService(cms: ControlCms) {
    const service = cms.config.collections;
    if (!service) {
        throw Object.assign(new Error("Collection installation is not configured"), { status: 503 });
    }
    return service;
}
export function invalidateCollections(cms: ControlCms) {
    invalidateGlobalStyleAndPages(cms);
}
