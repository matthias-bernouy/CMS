import { afterEach, describe, expect, test } from "bun:test";
import { cleanupRegistryFixtures, publicationPackage } from "../fixtures";
import { bootstrapPlan, bootstrapPublisher, registryFixture, restartedBootstrapPublisher } from "./fixtures";

afterEach(cleanupRegistryFixtures);

describe("official bootstrap exact-plan recovery", () => {
    test("resumes a strict digest-equal catalog subset and becomes an idempotent no-op", async () => {
        const fixture = registryFixture();
        const first = await publicationPackage("first", "1.0.0");
        const second = await publicationPackage("second", "1.0.0");
        const initial = bootstrapPublisher(fixture);
        await initial.publishPrepared(await initial.prepare(bootstrapPlan([first])));

        const restarted = await restartedBootstrapPublisher(fixture.root);
        const partial = await restarted.prepare(bootstrapPlan([second, first]));
        expect(partial).toMatchObject({ packageCount: 2, pendingPackageCount: 1 });
        expect((await restarted.publishPrepared(partial)).map(({ kind }) => kind)).toEqual(["second"]);

        const completed = await restartedBootstrapPublisher(fixture.root);
        const noOp = await completed.prepare(bootstrapPlan([first, second]));
        expect(noOp.pendingPackageCount).toBe(0);
        expect(await completed.publishPrepared(noOp)).toEqual([]);
    });

    test("fails closed on extra or digest-divergent catalog state", async () => {
        const fixture = registryFixture();
        const existing = await publicationPackage("existing", "1.0.0");
        const bootstrap = bootstrapPublisher(fixture);
        await bootstrap.publishPrepared(await bootstrap.prepare(bootstrapPlan([existing])));
        const restarted = await restartedBootstrapPublisher(fixture.root);
        const extraOnly = await publicationPackage("planned", "1.0.0");
        await expect(restarted.prepare(bootstrapPlan([extraOnly]))).rejects.toThrow(/outside the exact plan/i);

        const changed = await publicationPackage("existing", "1.0.0", {}, "different implementation\n");
        await expect(restarted.prepare(bootstrapPlan([changed]))).rejects.toThrow(/diverges from the exact plan/i);
    });
});
