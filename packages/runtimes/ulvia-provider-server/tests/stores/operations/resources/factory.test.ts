import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resourceInitializationFactory } from "../../../../src/runtime/stores/resources/initialization";
import { HostPreparationPool } from "../../../../src/runtime/instances/verification/HostPreparationPool";
import { initializationFixture } from "../../verification/resourcesFixture";

test("the runtime factory retains exact ZIPs privately and recovers an uncertain copy after the source disappears", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ulvia-resource-factory-"));
    const pool = new HostPreparationPool();
    try {
        const f = await initializationFixture(pool);
        let sourceReads = 0;
        let sourceAvailable = true;
        let uncertain = true;
        const build = () =>
            resourceInitializationFactory(
                "instance-a",
                "default",
                directory,
                f.options,
                f.options.content,
                {
                    createBloc: async (bloc) => {
                        const result = await f.options.createBloc(bloc);
                        if (uncertain) {
                            uncertain = false;
                            throw new Error("Uncertain Bloc commit");
                        }
                        return result;
                    },
                },
                f.options.intents,
                f.options.execution,
            )({
                ...pool.resources,
                authorize: f.options.authorize,
                source: async () => {
                    sourceReads++;
                    if (!sourceAvailable) {
                        throw new Error("Source ZIP was removed");
                    }
                    return { digest: f.archive.digest, bytes: f.archive.bytes };
                },
            });
        const service = build();
        const review = await service.plan("admin", "base", "en");
        const guard = { signal: new AbortController().signal, assertHeld() {} };
        let failure: unknown;
        try {
            await service.apply("admin", review, review.browserRiskDigest, guard);
        } catch (error) {
            failure = error;
        }
        expect(failure).toMatchObject({ message: "Uncertain Bloc commit" });
        expect((await readdir(directory)).filter((name) => name.endsWith(".zip"))).toHaveLength(1);
        expect((await f.raw.getBlocsList()).length).toBe(1);
        sourceAvailable = false;
        const recovered = build();
        expect((await recovered.apply("admin", review, review.browserRiskDigest, guard)).status).toBe("completed");
        expect((await f.raw.getPage("/"))?.visible).toBe(true);
        expect(await recovered.entry()).toEqual({ pending: false });
        expect(await readdir(directory)).toEqual([]);
        expect(sourceReads).toBe(2);
        await pool.close();
        expect((await recovered.apply("admin", review, review.browserRiskDigest, guard)).status).toBe("completed");
        await expect(recovered.apply("foreign", review, review.browserRiskDigest, guard)).rejects.toThrow(
            "Administrator",
        );
        expect(sourceReads).toBe(2);
    } finally {
        await pool.close();
        await rm(directory, { recursive: true, force: true });
    }
});
