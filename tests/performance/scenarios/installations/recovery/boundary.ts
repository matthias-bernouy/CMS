import type { SiteUpgradeStorage, SiteUpgradeIntent, SiteUpgradeActive } from "@bernouy/repository/upgrades";

/** Test-process-only fault: retain the service's real prepared intent and stop before its commit path. */
export async function interruptPreparedUpgrade(
    storage: Pick<SiteUpgradeStorage, "begin">,
    apply: () => Promise<unknown>,
    validate: (intent: SiteUpgradeIntent<unknown>) => void,
): Promise<SiteUpgradeActive> {
    const interrupted = new Error("Owned fixture interrupted after durable preparation");
    const begin = storage.begin;
    let prepared: SiteUpgradeActive | undefined;
    storage.begin = async <T>(intent: SiteUpgradeIntent<T>) => {
        validate(intent);
        const result = await begin.call(storage, intent);
        if (result.status !== "prepared") {
            throw new Error("Fixture did not create a prepared upgrade");
        }
        prepared = result;
        throw interrupted;
    };
    try {
        await apply();
        throw new Error("Fixture did not reach the durable preparation boundary");
    } catch (error) {
        if (error !== interrupted || !prepared) {
            throw error;
        }
        return prepared;
    } finally {
        storage.begin = begin;
    }
}
