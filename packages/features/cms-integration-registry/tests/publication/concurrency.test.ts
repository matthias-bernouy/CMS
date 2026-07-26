import { afterEach, describe, expect, test } from "bun:test";
import { IntegrationRegistryVersionConflictError } from "@bernouy/cms-integration-registry";
import { cleanupRegistryFixtures, publicationPackage, registryFixture } from "./fixtures";

afterEach(cleanupRegistryFixtures);

describe("filesystem integration registry publication concurrency", () => {
    test("serializes one kind and gives one immutable coordinate exactly one winner", async () => {
        const fixture = registryFixture();
        const input = await publicationPackage("demo", "1.0.0");

        const results = await Promise.allSettled([
            fixture.publisher.publish({ package: input }),
            fixture.publisher.publish({ package: input }),
        ]);

        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const rejection = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
        expect(rejection.reason).toBeInstanceOf(IntegrationRegistryVersionConflictError);
        expect(fixture.snapshots.current().listVersions("demo")).toHaveLength(1);
    });

    test("publishes different kinds concurrently without losing either snapshot update", async () => {
        let arrivals = 0;
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const fixture = registryFixture({
            afterBoundary: async ({ phase }) => {
                if (phase !== "index-written") {
                    return;
                }
                arrivals += 1;
                if (arrivals === 2) {
                    release();
                }
                await gate;
            },
        });

        await Promise.all([
            fixture.publisher.publish({ package: await publicationPackage("alpha", "1.0.0") }),
            fixture.publisher.publish({ package: await publicationPackage("beta", "1.0.0") }),
        ]);

        expect(fixture.snapshots.current().summaries.map((summary) => summary.kind)).toEqual(["alpha", "beta"]);
    });

    test("keeps captured reader snapshots immutable until and after the atomic swap", async () => {
        let indexed!: () => void;
        const reachedIndex = new Promise<void>((resolve) => {
            indexed = resolve;
        });
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const fixture = registryFixture({
            afterBoundary: async ({ phase }) => {
                if (phase === "index-written") {
                    indexed();
                    await gate;
                }
            },
        });
        const captured = fixture.snapshots.current();
        const publication = fixture.publisher.publish({ package: await publicationPackage("demo", "1.0.0") });

        await reachedIndex;
        expect(fixture.snapshots.current()).toBe(captured);
        expect(captured.getIndex("demo")).toBeNull();
        release();
        await publication;

        expect(fixture.snapshots.current()).not.toBe(captured);
        expect(fixture.snapshots.current().getIndex("demo")).not.toBeNull();
        expect(captured.getIndex("demo")).toBeNull();
    });
});
