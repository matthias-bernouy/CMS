import { expect, test } from "bun:test";
import { MemoryResourceInitializationStateStore } from "../../src/exports/memory";
import { MongoResourceInitializationStateStore } from "../../src/exports/mongo";
import {
    parseResourceInitializationState,
    pendingResourceInitialization,
    ResourceInitializationService,
} from "../../src/exports/initialization";
import { initializationFixture } from "./fixtures";
import { mongoFixture } from "../entities/mongoFixture";

test("missing initialization state fails without read-time provisioning", async () => {
    const f = await initializationFixture();
    const state = new MemoryResourceInitializationStateStore("instance-a", "site-a");
    const service = new ResourceInitializationService({ ...f.options, state });
    await expect(service.plan("admin", "empty", "en")).rejects.toThrow("not configured");
    expect(await state.read()).toBeNull();
    expect((await f.raw.scanPages(undefined, 1)).pages).toHaveLength(0);
});

test("persisted checkpoints reject unreviewed resources, duplicate Page identities and false completion", async () => {
    const f = await initializationFixture();
    const review = await f.service.plan("admin", "base", "en");
    const running = { ...pendingResourceInitialization("instance-a", "site-a"), status: "running", review };
    for (const progress of [
        { ...running.progress, assets: ["foreign/base:asset"] },
        { ...running.progress, texts: ["foreign/base"] },
        { ...running.progress, blocs: ["foreign-bloc"] },
        { ...running.progress, pageIds: { "/other": "id" } },
        { ...running.progress, pageIds: { "/": "same", "/login": "same" } },
        { ...running.progress, pages: ["/"] },
    ]) {
        expect(() => parseResourceInitializationState({ ...running, progress })).toThrow();
    }
    expect(() => parseResourceInitializationState({ ...running, status: "completed" })).toThrow("incomplete");
});

test("state adapters enforce scope, monotonic progress and compare-and-swap revisions", async () => {
    const f = await initializationFixture();
    const review = await f.service.plan("admin", "base", "en");
    const mongo = mongoFixture("cms_resource_initialization");
    for (const store of [
        new MemoryResourceInitializationStateStore("instance-a", "site-a"),
        new MongoResourceInitializationStateStore(mongo.db, "instance-a", "site-a"),
    ]) {
        expect(await store.read()).toBeNull();
        await store.initialize();
        const pending = (await store.read())!;
        await expect(
            store.replace({ ...pending, instanceId: "instance-b", status: "running", revision: 1, review }, 0),
        ).rejects.toBeInstanceOf(Error);
        const running = { ...pending, status: "running" as const, revision: 1, review };
        const attempts = await Promise.allSettled([store.replace(running, 0), store.replace(running, 0)]);
        expect(attempts.filter((item) => item.status === "fulfilled")).toHaveLength(1);
        await store.replace(
            { ...running, revision: 2, progress: { ...running.progress, assets: review.keys.assets } },
            1,
        );
        await expect(store.replace({ ...running, revision: 3 }, 2)).rejects.toThrow("cannot be replaced or removed");
        await store.initialize();
        expect((await store.read())?.revision).toBe(2);
    }
    const other = new MongoResourceInitializationStateStore(mongo.db, "instance-b", "site-a");
    expect(await other.read()).toBeNull();
    expect(
        mongo.writes
            .filter((write) => write.kind === "replace")
            .every(
                (write) =>
                    write.filter?.instanceId === "instance-a" &&
                    write.filter?.siteId === "site-a" &&
                    typeof write.filter?.revision === "number",
            ),
    ).toBe(true);
});

test("Mongo state refuses malformed records without inferring or repairing protocol fields", async () => {
    const f = mongoFixture("cms_resource_initialization");
    const state = new MongoResourceInitializationStateStore(f.db, "instance-a", "site-a");
    await state.initialize();
    const row = [...f.rows.values()][0]!;
    delete row.protocol;
    const before = f.writes.length;
    await expect(state.read()).rejects.toBeInstanceOf(Error);
    expect(f.writes.length).toBe(before);
    await expect(state.initialize()).rejects.toBeInstanceOf(Error);
    expect(row.protocol).toBeUndefined();
});
