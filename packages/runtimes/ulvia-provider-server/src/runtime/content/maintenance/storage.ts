import type { SiteUpgradeStorage, SiteUpgradeIntent } from "@bernouy/repository/upgrades";
import type { MaintenancePages } from "./MaintenancePages";
import type { Logger } from "@bernouy/logging";

/** Freeze presentation before begin makes the prepared intent publicly unavailable. */
export function withMaintenancePages<T extends SiteUpgradeStorage>(
    storage: T,
    pages: MaintenancePages,
    logger: Logger,
): T {
    return new Proxy(storage, {
        get(target, property) {
            if (property === "begin") {
                return async <P>(intent: SiteUpgradeIntent<P>) => {
                    const existing = await target.get(intent.siteId, intent.id, intent.kind);
                    if (!existing) {
                        await pages.prepare(intent.siteId, intent.id);
                    }
                    try {
                        return await target.begin(intent);
                    } catch (error) {
                        // An uncertain begin may have committed; retain its exact presentation.
                        if (!(await target.get(intent.siteId, intent.id, intent.kind))) {
                            await pages.retire(intent.siteId, intent.id);
                        }
                        throw error;
                    }
                };
            }
            if (property === "transition") {
                return async (...args: Parameters<SiteUpgradeStorage["transition"]>) => {
                    await target.transition(...args);
                    if (["completed", "cancelled"].includes(args[3])) {
                        await pages
                            .retire(args[0], args[1])
                            .catch((error) => logger.warn("maintenance.page.cleanup.failed", {}, error));
                    }
                };
            }
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
        },
    });
}
