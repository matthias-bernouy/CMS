import { expect, test } from "bun:test";
import { SiteInitializationService } from "@bernouy/cms-repository/collections/installations";
import type { InitializationRecord } from "@bernouy/cms-repository/collections/installations";
import { initializationFixture } from "./fixture";

for (const phase of [
    "running-record",
    "applying-intent",
    "installMany",
    "insertPage",
    "updatePage",
    "completed-page",
    "completed-record",
]) {
    test(`initialization recovers after uncertain ${phase} persistence without fetching the Repository again`, async () => {
        const f = await initializationFixture();
        const review = await f.service.plan("admin", f.root);
        let interrupted = false;
        f.model.fault = (name, args) => {
            const record = args[0] as InitializationRecord;
            const trigger =
                phase === name ||
                (phase === "running-record" && name === "replace" && record.status === "running") ||
                (phase === "completed-record" && name === "replace" && record.status === "completed") ||
                (phase === "completed-page" && name === "replace" && record.completedPages.length === 1) ||
                (phase === "applying-intent" && name === "transition" && args[3] === "applying");
            if (!interrupted && trigger) {
                interrupted = true;
                throw new Error("Simulated interruption after persistence");
            }
        };
        await expect(f.service.apply("admin", f.root, review.digest)).rejects.toThrow("Simulated interruption");
        expect(interrupted).toBe(true);
        await expect(f.guarded.insertPage("/unrelated", "Unrelated")).rejects.toMatchObject({ status: 423 });
        const before = { list: f.model.list, bundles: f.model.bundles, metadata: f.model.metadata };
        const resumed = new SiteInitializationService({
            ...f.options,
            source: {
                ...f.options.source,
                list: async () => {
                    throw new Error("Repository offline");
                },
                getMetadata: async () => {
                    throw new Error("Repository offline");
                },
                get: async () => {
                    throw new Error("Repository offline");
                },
            },
        });
        expect((await resumed.apply("admin", f.root, review.digest)).status).toBe("completed");
        expect({ list: f.model.list, bundles: f.model.bundles, metadata: f.model.metadata }).toEqual(before);
        expect((await f.raw.getAllPages()).map(({ path }) => path)).toEqual(["/admin"]);
        expect(await f.options.upgrades.getActive("default")).toBeNull();
        await f.guarded.insertPage("/unrelated", "Unrelated");
    });
}
