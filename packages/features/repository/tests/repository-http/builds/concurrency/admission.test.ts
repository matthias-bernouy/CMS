import { expect, test } from "bun:test";
import { join } from "node:path";
import { truncate, writeFile } from "node:fs/promises";
import { buildCollectionBundle } from "repository/repository/filesystem/builds/collections";
import { InMemoryReleaseCatalogue } from "repository/contracts/default-implementation/memory/InMemoryReleaseCatalogue";
import { DEFAULT_COLLECTION_LIMITS } from "repository/collections/core/limits";
import { sourceFixture } from "../../../../../../../tests/fixtures/repository/sourceBuild";

for (const limit of ["count", "bytes"] as const) {
    test(`queued builds bound retained ${limit}, cancel before catalogue loading and release admission`, async () => {
        const f = await sourceFixture();
        const root = join(f.root, "bounded");
        const ready = Promise.withResolvers<void>();
        const resume = Promise.withResolvers<void>();
        const controller = new AbortController();
        const jobs: ReturnType<typeof buildCollectionBundle>[] = [];
        let loads = 0;
        const catalogue = async () => {
            loads++;
            return new InMemoryReleaseCatalogue();
        };
        try {
            const active = buildCollectionBundle(root, f.envelope, async () => {
                ready.resolve();
                await resume.promise;
                return catalogue();
            });
            jobs.push(active);
            await ready.promise;
            if (limit === "count") {
                for (let i = 0; i < 15; i++) {
                    const pending = buildCollectionBundle(root, f.envelope, catalogue, controller.signal);
                    void pending.catch(() => undefined);
                    jobs.push(pending);
                }
                await expect(buildCollectionBundle(root, f.envelope, catalogue)).rejects.toThrow("already held");
            } else {
                const path = join(f.root, "oversized");
                await writeFile(path, "");
                await truncate(
                    path,
                    DEFAULT_COLLECTION_LIMITS.maxBundleBytes + 2 * DEFAULT_COLLECTION_LIMITS.maxDocumentBytes + 1,
                );
                await expect(
                    buildCollectionBundle(
                        root,
                        {
                            ...f.envelope,
                            assets: [{ id: "oversized", bytes: Bun.file(path) }],
                        },
                        catalogue,
                    ),
                ).rejects.toThrow("already held");
            }
            controller.abort(new Error("cancel queued compilation"));
            const refused = await Promise.allSettled(jobs.slice(1));
            expect(
                refused.every(
                    (value) => value.status === "rejected" && value.reason.message === "cancel queued compilation",
                ),
            ).toBe(true);
            expect(loads).toBe(0);
            resume.resolve();
            expect((await active).admission.digest).toBe(f.admission.digest);
            expect((await buildCollectionBundle(root, f.envelope, catalogue)).admission.digest).toBe(
                f.admission.digest,
            );
            expect(loads).toBe(2);
        } finally {
            controller.abort();
            resume.resolve();
            await Promise.allSettled(jobs);
            await f.close();
        }
    });
}
