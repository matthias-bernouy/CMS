import { expect, test } from "bun:test";
import type { Db } from "mongodb";
import { ContentValidationError } from "@bernouy/cms-content";
import { MongoCmsRepository } from "@bernouy/cms-content/mongo";
import { createMongoContentRepository } from "../contentMongoFixture";

test("Mongo preserves a literal language-looking path when the default changes", async () => {
    const { repository } = createMongoContentRepository();
    await repository.init();
    await repository.updateSystem({ site: { language: "fr", additionalLanguages: ["en"] } as never });
    await repository.insertPage("/en/about", "About");
    const page = (await repository.getPage("/en/about"))!;

    await repository.updateSystem({ site: { language: "en", additionalLanguages: ["fr"] } as never });
    expect((await repository.getPageById(page.id))?.paths).toEqual({ en: "/en/about", fr: "/en/about" });
    expect((await repository.getPageById(page.id))?.path).toBe("/en/about");
    await repository.init();
    expect((await repository.getPageById(page.id))?.path).toBe("/en/about");
});

test("Mongo refuses URL edits without a configured language", async () => {
    const { repository } = createMongoContentRepository();
    await repository.init();
    await repository.insertPage("/before", "Before");
    const page = (await repository.getPage("/before"))!;

    await expect(repository.updatePage({ id: page.id, path: "/after" })).rejects.toBeInstanceOf(ContentValidationError);
    expect(await repository.getPageRoute("/after")).toBeNull();
});

test("Mongo skips page route migration for unrelated settings changes", async () => {
    const { db, repository } = createMongoContentRepository();
    await repository.init();
    await repository.updateSystem({ site: { language: "fr", additionalLanguages: ["en"] } as never });
    await repository.insertPage("/about", "About");
    const before = db.requestedCollections.filter((name) => name === "pages").length;

    await repository.updateSystem({ site: { favicon: "/logo.svg", activeLanguages: ["en"] } as never });
    expect(db.requestedCollections.filter((name) => name === "pages")).toHaveLength(before);

    await repository.updateSystem({ site: { additionalLanguages: ["en", "de"] } as never });
    expect(db.requestedCollections.filter((name) => name === "pages").length).toBeGreaterThan(before);
});

test("Mongo resumes an interrupted language migration before exposing its new settings", async () => {
    const { db, repository } = createMongoContentRepository();
    await repository.init();
    await repository.updateSystem({ site: { language: "fr", additionalLanguages: ["en"] } as never });
    await repository.insertPage("/francais", "About");
    const page = (await repository.getPage("/francais"))!;
    await repository.setPagePaths(page.id, { fr: "/francais", en: "/english" });

    let interrupted = false;
    db.get("pages").afterUpdateOne = async (update) => {
        if (!interrupted && update.$set.path === "/english") {
            interrupted = true;
            throw new Error("interrupted after saving the page");
        }
    };
    await expect(
        repository.updateSystem({ site: { language: "en", additionalLanguages: ["fr"] } as never }),
    ).rejects.toThrow("interrupted after saving the page");
    expect((await repository.getSystem()).pageRoutesUpdating).toBe(true);

    db.get("pages").afterUpdateOne = undefined;
    await repository.init();
    expect((await repository.getSystem()).site.language).toBe("en");
    expect((await repository.getSystem()).pageRoutesUpdating).toBeUndefined();
    expect(await repository.getPageRoute("/english")).toMatchObject({ state: "current", pageId: page.id });
    expect(await repository.getPageRoute("/francais")).toMatchObject({ state: "redirect", pageId: page.id });
});

test("a language switch waits for a page insert already in flight", async () => {
    const { db, repository } = createMongoContentRepository();
    await repository.init();
    await repository.updateSystem({ site: { language: "fr", additionalLanguages: ["en"] } as never });
    let enterInsert!: () => void;
    let releaseInsert!: () => void;
    const inserting = new Promise<void>((resolve) => {
        enterInsert = resolve;
    });
    const held = new Promise<void>((resolve) => {
        releaseInsert = resolve;
    });
    db.get("page_routes").beforeInsertOne = async (route) => {
        if (route._id === "/late") {
            enterInsert();
            await held;
        }
    };
    const insert = repository.insertPage("/late", "Late page");
    await inserting;

    let markerAttempt!: () => void;
    const attempted = new Promise<void>((resolve) => {
        markerAttempt = resolve;
    });
    db.get("system").beforeUpdateOne = async (update) => {
        if (update.$set.routeMigration) {
            markerAttempt();
        }
    };
    const switchLanguage = repository.updateSystem({ site: { language: "en", additionalLanguages: ["fr"] } as never });
    await attempted;
    try {
        expect((await db.get("system").findOne({ _id: "singleton" }))?.routeMigration).toBeUndefined();
    } finally {
        releaseInsert();
    }
    await Promise.all([insert, switchLanguage]);

    const page = (await repository.getPage("/late"))!;
    expect(page.paths).toEqual({ fr: "/late", en: "/late" });
    expect(await repository.getPageRoute("/late")).toMatchObject({ state: "current", language: "en" });
    expect(await repository.getPageRoute("/fr/late")).toMatchObject({ state: "current", language: "fr" });
});

test("another server's init cannot clear a live page write before migration", async () => {
    const { db, repository } = createMongoContentRepository();
    await repository.init();
    await repository.updateSystem({ site: { language: "fr", additionalLanguages: ["en"] } as never });
    const second = new MongoCmsRepository(db as unknown as Db);
    let enterInsert!: () => void;
    let releaseInsert!: () => void;
    const inserting = new Promise<void>((resolve) => {
        enterInsert = resolve;
    });
    const held = new Promise<void>((resolve) => {
        releaseInsert = resolve;
    });
    db.get("pages").beforeInsertOne = async (page) => {
        if (page.path === "/late") {
            enterInsert();
            await held;
        }
    };
    const insert = repository.insertPage("/late", "Late");
    await inserting;
    let initFinished = false;
    const init = second.init().then(() => {
        initFinished = true;
    });
    const switchLanguage = repository
        .updateSystem({ site: { language: "en", additionalLanguages: ["fr"] } as never })
        .then(
            () => true,
            () => false,
        );
    try {
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(initFinished).toBe(false);
        expect((await db.get("system").findOne({ _id: "singleton" }))?.activePageWrites).toBe(1);
        expect((await repository.getSystem()).site.language).toBe("fr");
    } finally {
        releaseInsert();
    }
    await insert;
    await init;
    const switched = await switchLanguage;
    if (!switched) {
        await repository.updateSystem({ site: { language: "en", additionalLanguages: ["fr"] } as never });
    }
    const page = (await repository.getPage("/late"))!;
    expect(page.paths).toEqual({ fr: "/late", en: "/late" });
    expect(await repository.getPageRoute("/late")).toMatchObject({ state: "current", language: "en" });
    expect(await repository.getPageRoute("/fr/late")).toMatchObject({ state: "current", language: "fr" });
});

test("startup releases an interrupted page insert's orphan route", async () => {
    const { db, repository } = createMongoContentRepository();
    await repository.init();
    await repository.updateSystem({ site: { language: "fr" } as never });
    await db.get("page_routes").insertOne({
        _id: "/orphan",
        state: "current",
        pageId: "missing-page",
        ownerPageId: "missing-page",
        language: "fr",
        pageInsertToken: "missing-page",
    });

    await repository.init();
    expect(await repository.getPageRoute("/orphan")).toBeNull();
    await repository.insertPage("/orphan", "Reused");
    expect((await repository.getPage("/orphan"))?.title).toBe("Reused");
    expect((await db.get("page_routes").findOne({ _id: "/orphan" }))?.pageInsertToken).toBeUndefined();
});

test("startup completes a page insert whose route still carries its intent", async () => {
    const { db, repository } = createMongoContentRepository();
    await repository.init();
    await repository.updateSystem({ site: { language: "fr" } as never });
    await repository.insertPage("/saved", "Saved");
    const page = (await repository.getPage("/saved"))!;
    await db.get("page_routes").updateOne({ _id: "/saved" }, { $set: { pageInsertToken: page.id } });

    await repository.init();
    expect(await repository.getPageRoute("/saved")).toMatchObject({ state: "current", pageId: page.id });
    expect((await db.get("page_routes").findOne({ _id: "/saved" }))?.pageInsertToken).toBeUndefined();
});

test("startup waits for a live migration instead of replaying it", async () => {
    const { db, repository } = createMongoContentRepository();
    await repository.init();
    await repository.updateSystem({ site: { language: "fr", additionalLanguages: ["en"] } as never });
    await repository.insertPage("/old", "Old");
    const page = (await repository.getPage("/old"))!;
    await repository.setPagePaths(page.id, { fr: "/old", en: "/new" });
    const second = new MongoCmsRepository(db as unknown as Db);
    let enterUpdate!: () => void;
    let releaseUpdate!: () => void;
    const updating = new Promise<void>((resolve) => {
        enterUpdate = resolve;
    });
    const held = new Promise<void>((resolve) => {
        releaseUpdate = resolve;
    });
    let paused = false;
    db.get("pages").beforeUpdateOne = async (update) => {
        if (!paused && update.$set.path === "/new") {
            paused = true;
            enterUpdate();
            await held;
        }
    };
    const migration = repository.updateSystem({ site: { language: "en", additionalLanguages: ["fr"] } as never });
    await updating;
    const ownerToken = ((await db.get("system").findOne({ _id: "singleton" }))?.routeMigration as { token: string })
        .token;
    let initFinished = false;
    const init = second.init().then(() => {
        initFinished = true;
    });
    try {
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(initFinished).toBe(false);
        expect(
            ((await db.get("system").findOne({ _id: "singleton" }))?.routeMigration as { token: string }).token,
        ).toBe(ownerToken);
    } finally {
        releaseUpdate();
    }
    await Promise.all([migration, init]);
    expect((await repository.getSystem()).site.language).toBe("en");
    expect(await repository.getPageRoute("/new")).toMatchObject({ state: "current", pageId: page.id });
});

test("startup reaps an expired page-write permit before claiming route recovery", async () => {
    const { db, repository } = createMongoContentRepository();
    await repository.init();
    await db
        .get("system")
        .updateOne(
            { _id: "singleton" },
            { $set: { activePageWrites: 1, activePageWritePermits: { crashed: new Date(0) } } },
        );

    await repository.init();
    const system = await db.get("system").findOne({ _id: "singleton" });
    expect(system?.activePageWrites).toBe(0);
    expect(system?.routeMigration).toBeUndefined();
});

test("a stale unrelated settings save cannot undo a completed language switch", async () => {
    const { db, repository } = createMongoContentRepository();
    await repository.init();
    await repository.updateSystem({ site: { language: "fr", additionalLanguages: ["en"] } as never });
    await repository.insertPage("/about", "About");
    let enterRead!: () => void;
    let releaseRead!: () => void;
    const reading = new Promise<void>((resolve) => {
        enterRead = resolve;
    });
    const held = new Promise<void>((resolve) => {
        releaseRead = resolve;
    });
    let paused = false;
    db.get("system").afterFindOne = async (filter) => {
        if (filter._id === "singleton" && !paused) {
            paused = true;
            enterRead();
            await held;
        }
    };
    const saveFavicon = repository.updateSystem({ site: { favicon: "/new.ico" } as never });
    await reading;
    try {
        await repository.updateSystem({ site: { language: "en", additionalLanguages: ["fr"] } as never });
    } finally {
        releaseRead();
    }
    await saveFavicon;

    const system = await repository.getSystem();
    expect(system.site.language).toBe("en");
    expect(system.site.favicon).toBe("/new.ico");
    expect(await repository.getPageRoute("/about")).toMatchObject({ state: "current", language: "en" });
});
