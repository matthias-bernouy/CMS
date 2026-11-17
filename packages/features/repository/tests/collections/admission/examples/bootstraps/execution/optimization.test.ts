import { expect, test } from "bun:test";
import { HttpCollectionRepository } from "@bernouy/repository/collections/http";
import { inlineCollectionVerifier } from "@bernouy/repository/collections/sources";
import { initializationFixture } from "./fixture";

test("an exact initialization refreshes availability while reusing immutable artifacts across actor-bound reviews", async () => {
    const f = await initializationFixture();
    const entry = (await f.options.source.list())[0]!;
    let lookups = 0;
    let downloads = 0;
    let admissions = 0;
    const remote = new HttpCollectionRepository("local", "https://repository.example", {
        request: async () => {
            downloads++;
            return Response.json(f.artifact.release);
        },
    });
    f.options.source.list = async () => {
        throw new Error("An exact recipe must not scan unrelated history");
    };
    f.options.source.page = async (input, signal) => {
        lookups++;
        expect(input).toEqual({
            mode: "history",
            channel: "all",
            publisherId: f.root.publisherId,
            collectionId: f.root.collectionId,
            version: f.root.version,
            limit: 1,
        });
        expect(signal?.aborted).toBe(false);
        return { entries: [entry] };
    };
    f.options.source.getMetadata = remote.getMetadata.bind(remote);
    f.options.source.get = remote.get.bind(remote);
    Object.assign(f.options, {
        verifier: {
            ...inlineCollectionVerifier,
            metadata: async (...args: Parameters<typeof inlineCollectionVerifier.metadata>) => {
                admissions++;
                return inlineCollectionVerifier.metadata(...args);
            },
        },
    });
    const first = await f.service.plan("admin", f.root);
    expect(first.plan.pages).toHaveLength(1);
    expect({ lookups, downloads, admissions }).toEqual({ lookups: 1, downloads: 1, admissions: 1 });
    const second = await f.service.plan("another-admin", f.root);
    expect(second.actorId).toBe("another-admin");
    expect(second.digest).not.toBe(first.digest);
    expect({ lookups, downloads, admissions }).toEqual({ lookups: 2, downloads: 1, admissions: 1 });
    expect((await f.raw.scanPages(undefined, 1)).pages).toEqual([]);
    expect((await f.options.collections.listInstalled("default")).items).toEqual([]);
});

test("withdrawn, substituted and oversized exact catalogue responses refuse before any bundle read", async () => {
    for (const mode of ["withdrawn", "substituted", "oversized"]) {
        const f = await initializationFixture();
        const entry = (await f.options.source.list())[0]!;
        f.options.source.page = async () =>
            mode === "withdrawn"
                ? { entries: [] }
                : mode === "oversized"
                  ? { entries: [entry], nextCursor: "extra" }
                  : { entries: [{ ...entry, digest: `sha256:${"0".repeat(64)}` }] };
        await expect(f.service.plan("admin", f.root)).rejects.toThrow();
        expect(f.model.bundles).toBe(0);
        expect((await f.raw.scanPages(undefined, 1)).pages).toEqual([]);
        expect((await f.state.read("default"))?.revision).toBe(0);
    }
});

test("cancellation between preparation and preview is passed to ordinary Page checkpoints without durable writes", async () => {
    const f = await initializationFixture();
    const controller = new AbortController();
    const preview = f.options.validateCandidate;
    Object.assign(f.options, {
        validateCandidate: async (...args: Parameters<typeof preview>) => {
            controller.abort();
            return preview(...args);
        },
    });
    await expect(f.service.plan("admin", f.root, undefined, controller.signal)).rejects.toThrow();
    expect((await f.raw.scanPages(undefined, 1)).pages).toEqual([]);
    expect((await f.options.collections.listInstalled("default")).items).toEqual([]);
    expect((await f.state.read("default"))?.status).toBe("pending");
});
