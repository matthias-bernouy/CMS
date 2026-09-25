import { describe, expect, test } from "bun:test";
import { installationWorkflow } from "./fixtures";

describe("installation compare-and-swap storage", () => {
    test("exactly one concurrent approval can allocate an installation ID", async () => {
        const { lifecycle, candidate, report, store } = await installationWorkflow();
        const first = await lifecycle.prepare(candidate, report);
        const second = await lifecycle.prepare(candidate, report);
        const results = await Promise.allSettled([
            lifecycle.approve(first, "admin:first"),
            lifecycle.approve(second, "admin:second"),
        ]);
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
        expect(await store.list(candidate.siteId)).toHaveLength(1);
    });

    test("exactly one simultaneous observation commits at the expected revision", async () => {
        const { approve, lifecycle, scope, report, store } = await installationWorkflow();
        await approve();
        const results = await Promise.allSettled([
            lifecycle.observe(scope, 1, report),
            lifecycle.observe(scope, 1, report),
        ]);
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const failed = results.find((result) => result.status === "rejected");
        expect(failed?.status === "rejected" && failed.reason.code).toBe("revision_conflict");
        expect((await store.get(scope))!.revision).toBe(2);
    });

    test("an observation in progress cannot resurrect a concurrently revoked installation", async () => {
        const { approve, lifecycle, scope, report, store } = await installationWorkflow();
        await approve();
        const pending = lifecycle.observe(scope, 1, report);
        const revoked = await lifecycle.revoke(scope, 1);
        await expect(pending).rejects.toMatchObject({ code: "revision_conflict" });
        expect(await store.get(scope)).toEqual(revoked);
        expect(revoked.observation).toBeUndefined();
    });

    test("simultaneous manifest modifications cannot lose an accepted update", async () => {
        const { approve, lifecycle, scope, report, store } = await installationWorkflow();
        await approve();
        const first = await lifecycle.prepareModification(scope, 1, { configuration: { locale: "fr" } }, report);
        const second = await lifecycle.prepareModification(scope, 1, { providerTokenRef: "${ROTATED_TOKEN}" }, report);
        const results = await Promise.allSettled([
            lifecycle.modify(first, "admin:first"),
            lifecycle.modify(second, "admin:second"),
        ]);
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        expect((await store.get(scope))!.revision).toBe(2);
    });
});
