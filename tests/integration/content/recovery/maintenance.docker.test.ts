import { expect, test } from "bun:test";
import { isDeepStrictEqual } from "node:util";
import type { Document } from "mongodb";
import { MongoContentRepository } from "@bernouy/content/mongo";
import { upgradeMongoContentReferences, recoverMongoContentReferenceFence } from "@bernouy/content/mongo/maintenance";
import { createCmsSiteBloc, readCmsSiteBloc } from "@bernouy/content";
import { contentMongo } from "../mongo";

const integration = process.env.ULVIA_RUN_CONTENT_LIFECYCLE === "1" ? test : test.skip;

integration(
    "an existing populated database upgrades explicitly, idempotently and without rewriting authoring data",
    async () => {
        const f = await contentMongo();
        try {
            const db = f.client.db();
            const raw = new MongoContentRepository(db);
            await raw.init();
            await createCmsSiteBloc(raw, {
                tag: "site-existing",
                name: "Existing",
                group: "Site",
                content: "<section><p>Keep me</p></section>",
            });
            const blocs = db.collection<Document & { _id: string }>("blocs");
            await blocs.updateOne({ _id: "site-existing" }, { $unset: { contentReferences: "" } });
            await db.collection("content_metadata").deleteMany({});
            const before = await blocs.findOne({ _id: "site-existing" });
            await expect(new MongoContentRepository(db).init()).rejects.toThrow(
                "explicit Bloc reference projection upgrade",
            );
            await expect(upgradeMongoContentReferences(db, { writersStopped: false } as never)).rejects.toThrow(
                "offline acknowledgement",
            );
            const result = await upgradeMongoContentReferences(db, { writersStopped: true });
            expect(result).toMatchObject({ scanned: 1, updated: 1, complete: true });
            const { contentReferences, ...after } = (await blocs.findOne({ _id: "site-existing" }))!;
            expect(contentReferences).toEqual([]);
            expect(isDeepStrictEqual(after, before)).toBe(true);
            const reopened = new MongoContentRepository(db);
            await reopened.init();
            expect((await readCmsSiteBloc(reopened, { tag: "site-existing" })).definitionId).toBeTruthy();
            expect(await upgradeMongoContentReferences(db, { writersStopped: true })).toMatchObject({
                updated: 0,
                complete: true,
            });
        } finally {
            await f.close();
        }
    },
    60_000,
);

integration(
    "a failed upgrade stays unavailable and resumes its durable progress after the source is repaired",
    async () => {
        const f = await contentMongo();
        try {
            const db = f.client.db();
            const raw = new MongoContentRepository(db);
            await raw.init();
            await createCmsSiteBloc(raw, { tag: "site-a", name: "A", group: "Site", content: "<p>A</p>" });
            await createCmsSiteBloc(raw, { tag: "site-b", name: "B", group: "Site", content: "<p>B</p>" });
            const blocs = db.collection<Document & { _id: string }>("blocs");
            const original = (await blocs.findOne({ _id: "site-b" }))!;
            await blocs.updateMany({}, { $unset: { contentReferences: "" } });
            await blocs.updateOne({ _id: "site-b" }, { $set: { ownership: { kind: "invalid" } } });
            await db.collection("content_metadata").deleteMany({});
            await expect(upgradeMongoContentReferences(db, { writersStopped: true })).rejects.toThrow("ownership");
            await expect(new MongoContentRepository(db).init()).rejects.toThrow("projection format v1");
            expect(
                await db.collection("content_metadata").findOne({ _id: "bloc-references-upgrade" } as never),
            ).toMatchObject({ phase: "running", cursor: "site-a" });
            await blocs.updateOne({ _id: "site-b" }, { $set: { ownership: original.ownership } });
            expect(await upgradeMongoContentReferences(db, { writersStopped: true })).toMatchObject({
                resumed: true,
                complete: true,
            });
            await new MongoContentRepository(db).init();
        } finally {
            await f.close();
        }
    },
    60_000,
);

integration(
    "recovery refuses a foreign token and dangling references, then releases only a verified fence",
    async () => {
        const f = await contentMongo();
        try {
            const db = f.client.db();
            const raw = new MongoContentRepository(db);
            await raw.init();
            const locks = db.collection<Document & { _id: string }>("site_bloc_publication_locks");
            await locks.insertOne({
                _id: "published-graph",
                token: "inspected",
                phase: "committing",
                expiresAt: new Date(0),
                committingAt: new Date(0),
            });
            await expect(
                recoverMongoContentReferenceFence(db, { writersStopped: true, expectedToken: "foreign" }),
            ).rejects.toThrow("fence changed");
            expect((await locks.findOne({ _id: "published-graph" }))?.token).toBe("inspected");
            const pages = db.collection<Document & { _id: string }>("pages");
            await pages.insertOne({
                _id: "dangling",
                revision: 1,
                path: "/bad",
                title: "Bad",
                description: "",
                visible: false,
                tags: [],
                content: '<div cms-bloc="site-missing"></div>',
                contentReferences: ["bloc:site-missing"],
            });
            await expect(
                recoverMongoContentReferenceFence(db, { writersStopped: true, expectedToken: "inspected" }),
            ).rejects.toThrow("cannot be resolved");
            const held = (await locks.findOne({ _id: "published-graph" }))!;
            expect(held.token).not.toBe("inspected");
            expect(held.phase).toBe("committing");
            await pages.deleteOne({ _id: "dangling" });
            expect(
                await recoverMongoContentReferenceFence(db, { writersStopped: true, expectedToken: held.token }),
            ).toMatchObject({ recovered: true });
            expect(await locks.findOne({ _id: "published-graph" })).toBeNull();
        } finally {
            await f.close();
        }
    },
    60_000,
);
