import { expect, test } from "bun:test";
import { DuplicatePagePathError } from "@bernouy/cms-content";
import { createMongoContentRepository } from "../contentMongoFixture";

test("Mongo resumes a deletion interrupted just after recording its intent", async () => {
    const { db, repository } = createMongoContentRepository();
    await repository.init();
    await repository.updateSystem({ site: { language: "fr", additionalLanguages: ["en"] } as never });
    await repository.insertPage("/old", "Old");
    const page = (await repository.getPage("/old"))!;
    await repository.setPagePaths(page.id, { fr: "/old", en: "/old" });
    db.get("pages").afterUpdateOne = async (update) => {
        if (update.$set.deletionIntent) {
            throw new Error("simulated interruption after intent");
        }
    };

    await expect(repository.deletePage(page.id)).rejects.toThrow("simulated interruption");
    expect((await db.get("pages").findOne({ _id: page.id }))?.deletionIntent).toBeDefined();
    expect(await repository.getPageRoute("/old")).toMatchObject({ state: "current" });
    expect(await repository.getPublishedPage("/old")).toBeNull();
    await expect(repository.updatePage({ id: page.id, title: "Changed" })).rejects.toThrow("deletion is in progress");
    await expect(repository.setPagePaths(page.id, { fr: "/changed" })).rejects.toThrow("deletion is in progress");

    db.get("pages").afterUpdateOne = undefined;
    await repository.init();
    expect(await repository.getPageById(page.id)).toBeNull();
    for (const path of ["/old", "/en/old"]) {
        expect(await repository.getPageRoute(path)).toMatchObject({ state: "gone", pageId: page.id });
    }
    await expect(repository.insertPage("/old", "Reuse")).rejects.toBeInstanceOf(DuplicatePagePathError);
    expect(db.get("pages").indexes).toContainEqual({
        keys: { "deletionIntent.requestedAt": 1 },
        options: { sparse: true },
    });
});

test("Mongo completes partially updated routes and a later replacement deletion", async () => {
    const { db, repository } = createMongoContentRepository();
    await repository.init();
    await repository.updateSystem({ site: { language: "fr", additionalLanguages: ["en"] } as never });
    for (const path of ["/old", "/replacement", "/final"]) {
        await repository.insertPage(path, path);
        const page = (await repository.getPage(path))!;
        await repository.updatePage({ id: page.id, visible: true });
    }
    const old = (await repository.getPage("/old"))!;
    const replacement = (await repository.getPage("/replacement"))!;
    const final = (await repository.getPage("/final"))!;
    await repository.setPagePaths(old.id, { fr: "/new-old", en: "/old" });
    let changed = 0;
    db.get("page_routes").afterUpdateOne = async () => {
        if (++changed === 1) {
            throw new Error("simulated interruption during route update");
        }
    };

    await expect(repository.deletePageWithAlternative(old.id, replacement.id)).rejects.toThrow(
        "simulated interruption",
    );
    expect((await db.get("pages").findOne({ _id: old.id }))?.deletionIntent).toMatchObject({
        alternativeId: replacement.id,
        alternativePath: replacement.path,
    });
    db.get("page_routes").afterUpdateOne = undefined;

    await repository.deletePageWithAlternative(replacement.id, final.id);
    await repository.init();
    for (const path of ["/old", "/new-old", "/en/old", "/replacement"]) {
        expect(await repository.getPageRoute(path)).toMatchObject({ state: "redirect", pageId: final.id });
    }
    expect(await repository.getPageById(old.id)).toBeNull();
    expect(await repository.getPageById(replacement.id)).toBeNull();
});

test("Mongo resumes after route updates when the final page deletion was interrupted", async () => {
    const { db, repository } = createMongoContentRepository();
    await repository.init();
    await repository.insertPage("/old", "Old");
    const page = (await repository.getPage("/old"))!;
    db.get("pages").beforeDeleteOne = async () => {
        throw new Error("simulated interruption before page removal");
    };

    await expect(repository.deletePage(page.id)).rejects.toThrow("simulated interruption");
    expect(await repository.getPageRoute("/old")).toMatchObject({ state: "gone" });
    expect((await db.get("pages").findOne({ _id: page.id }))?.deletionIntent).toBeDefined();
    db.get("pages").beforeDeleteOne = undefined;

    await repository.init();
    expect(await repository.getPageById(page.id)).toBeNull();
    expect(await repository.getPageRoute("/old")).toMatchObject({ state: "gone" });
});

test("Mongo replays pending replacements before deleting their targets", async () => {
    const { db, repository } = createMongoContentRepository();
    await repository.init();
    for (const path of ["/middle", "/first", "/last"]) {
        await repository.insertPage(path, path);
    }
    const middle = (await repository.getPage("/middle"))!;
    const first = (await repository.getPage("/first"))!;
    const last = (await repository.getPage("/last"))!;
    await db.get("pages").updateOne(
        { _id: middle.id },
        {
            $set: {
                deletionIntent: { alternativeId: last.id, alternativePath: last.path, requestedAt: new Date() },
            },
        },
    );
    await db.get("pages").updateOne(
        { _id: first.id },
        {
            $set: {
                deletionIntent: { alternativeId: middle.id, alternativePath: middle.path, requestedAt: new Date() },
            },
        },
    );

    await repository.init();
    expect(await repository.getPageRoute("/first")).toMatchObject({ state: "redirect", pageId: last.id });
    expect(await repository.getPageRoute("/middle")).toMatchObject({ state: "redirect", pageId: last.id });
    expect(await repository.getPageById(first.id)).toBeNull();
    expect(await repository.getPageById(middle.id)).toBeNull();
});

test("Mongo follows a replacement that was deleted before the source resumed", async () => {
    const { db, repository } = createMongoContentRepository();
    await repository.init();
    for (const path of ["/first", "/middle", "/last"]) {
        await repository.insertPage(path, path);
    }
    const first = (await repository.getPage("/first"))!;
    const middle = (await repository.getPage("/middle"))!;
    const last = (await repository.getPage("/last"))!;
    await db.get("pages").updateOne(
        { _id: first.id },
        {
            $set: {
                deletionIntent: { alternativeId: middle.id, alternativePath: middle.path, requestedAt: new Date() },
            },
        },
    );
    await db.get("page_routes").updateOne({ _id: middle.path }, { $set: { state: "redirect", pageId: last.id } });
    await db.get("pages").deleteOne({ _id: middle.id });

    await repository.init();
    expect(await repository.getPageRoute("/first")).toMatchObject({ state: "redirect", pageId: last.id });
    expect(await repository.getPageById(first.id)).toBeNull();
});

test("concurrent replacement deletion waits until source routes point at it", async () => {
    const { db, repository } = createMongoContentRepository();
    await repository.init();
    await repository.insertPage("/first", "First");
    await repository.insertPage("/replacement", "Replacement");
    const first = (await repository.getPage("/first"))!;
    const replacement = (await repository.getPage("/replacement"))!;
    await repository.updatePage({ id: replacement.id, visible: true });
    let enterRouteWrite!: () => void;
    let releaseRouteWrite!: () => void;
    const writing = new Promise<void>((resolve) => {
        enterRouteWrite = resolve;
    });
    const held = new Promise<void>((resolve) => {
        releaseRouteWrite = resolve;
    });
    let paused = false;
    db.get("page_routes").beforeUpdateOne = async (update) => {
        if (!paused && update.$set.state === "redirect" && update.$set.pageId === replacement.id) {
            paused = true;
            enterRouteWrite();
            await held;
        }
    };

    const deleteFirst = repository.deletePageWithAlternative(first.id, replacement.id);
    await writing;
    const deleteReplacement = repository.deletePage(replacement.id);
    try {
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(await repository.getPageById(replacement.id)).not.toBeNull();
    } finally {
        releaseRouteWrite();
    }
    await Promise.all([deleteFirst, deleteReplacement]);
    expect(await repository.getPageRoute("/first")).toMatchObject({ state: "gone" });
    expect(await repository.getPageRoute("/replacement")).toMatchObject({ state: "gone" });
});
