import { expect, test } from "bun:test";
import type { Db } from "mongodb";
import { MongoCmsRepository } from "@bernouy/cms-content/mongo";
import { createMongoContentRepository } from "../contentMongoFixture";

test("Mongo rejects overlapping path writes to the same page across repository instances", async () => {
    const { db, repository } = createMongoContentRepository();
    await repository.init();
    await repository.updateSystem({ site: { language: "fr" } as never });
    await repository.insertPage("/before", "Before");
    const page = (await repository.getPage("/before"))!;
    const second = new MongoCmsRepository(db as unknown as Db);
    let entered!: () => void;
    let release!: () => void;
    const committing = new Promise<void>((resolve) => {
        entered = resolve;
    });
    const held = new Promise<void>((resolve) => {
        release = resolve;
    });
    db.get("pages").beforeUpdateOne = async (update) => {
        if (update.$set["pathUpdateIntent.phase"] === "committed") {
            entered();
            await held;
        }
    };

    const first = repository.setPagePaths(page.id, { fr: "/first" });
    await committing;
    try {
        await expect(second.setPagePaths(page.id, { fr: "/second" })).rejects.toMatchObject({
            status: 409,
            publicCode: "page_path_update_in_progress",
        });
        await expect(second.deletePage(page.id)).rejects.toMatchObject({ status: 409 });
    } finally {
        release();
    }
    await first;
    expect((await repository.getPageById(page.id))?.path).toBe("/first");
    expect(await repository.getPageRoute("/before")).toMatchObject({ state: "redirect" });
    expect(await repository.getPageRoute("/first")).toMatchObject({ state: "current" });
    expect(await repository.getPageRoute("/second")).toBeNull();
    expect((await db.get("pages").findOne({ _id: page.id }))?.pathUpdateIntent).toBeUndefined();
});

test("Mongo rejects a stale path edit after another editor has saved", async () => {
    const { repository } = createMongoContentRepository();
    await repository.init();
    await repository.updateSystem({ site: { language: "fr" } as never });
    await repository.insertPage("/before", "Before");
    const page = (await repository.getPage("/before"))!;

    await repository.setPagePaths(page.id, { fr: "/first" }, undefined, { fr: "/before" });
    await expect(
        repository.setPagePaths(page.id, { fr: "/second" }, undefined, { fr: "/before" }),
    ).rejects.toMatchObject({
        status: 409,
        publicCode: "page_paths_changed",
    });
    expect((await repository.getPageById(page.id))?.path).toBe("/first");
    expect(await repository.getPageRoute("/second")).toBeNull();
});

test("Mongo releases uncommitted route reservations after an interrupted path update", async () => {
    const { db, repository } = createMongoContentRepository();
    await repository.init();
    await repository.updateSystem({ site: { language: "fr" } as never });
    await repository.insertPage("/before", "Before");
    const page = (await repository.getPage("/before"))!;
    const token = "interrupted-write";
    await db
        .get("pages")
        .updateOne(
            { _id: page.id },
            { $set: { pathUpdateIntent: { token, requestedAt: new Date(), phase: "preparing" } } },
        );
    await db.get("page_routes").insertOne({
        _id: "/never-published",
        state: "current",
        pageId: page.id,
        ownerPageId: page.id,
        language: "fr",
        pathUpdateToken: token,
    });

    await repository.init();
    expect(await repository.getPageRoute("/never-published")).toBeNull();
    expect((await repository.getPageById(page.id))?.path).toBe("/before");
    expect((await db.get("pages").findOne({ _id: page.id }))?.pathUpdateIntent).toBeUndefined();
});

test("Mongo completes route cleanup after a path update commits but the process stops", async () => {
    const { db, repository } = createMongoContentRepository();
    await repository.init();
    await repository.updateSystem({ site: { language: "fr" } as never });
    await repository.insertPage("/before", "Before");
    const page = (await repository.getPage("/before"))!;
    db.get("pages").afterUpdateOne = async (update) => {
        if (update.$set["pathUpdateIntent.phase"] === "committed") {
            throw new Error("simulated stop after page commit");
        }
    };

    await expect(repository.setPagePaths(page.id, { fr: "/after" })).rejects.toThrow("simulated stop");
    expect((await db.get("pages").findOne({ _id: page.id }))?.pathUpdateIntent).toMatchObject({
        phase: "committed",
    });
    db.get("pages").afterUpdateOne = undefined;
    await repository.init();
    expect((await repository.getPageById(page.id))?.path).toBe("/after");
    expect(await repository.getPageRoute("/before")).toMatchObject({ state: "redirect" });
    expect(await repository.getPageRoute("/after")).toMatchObject({ state: "current" });
    expect((await db.get("page_routes").findOne({ _id: "/after" }))?.pathUpdateToken).toBeUndefined();
    expect((await db.get("pages").findOne({ _id: page.id }))?.pathUpdateIntent).toBeUndefined();
});
