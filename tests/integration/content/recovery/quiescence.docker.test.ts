import { expect, test } from "bun:test";
import { MongoClient } from "mongodb";
import { MongoContentRepository } from "@bernouy/content/mongo";
import { upgradeMongoContentReferences } from "@bernouy/content/mongo/maintenance";
import { contentMongo } from "../mongo";

const integration = process.env.ULVIA_RUN_CONTENT_LIFECYCLE === "1" ? test : test.skip;

integration(
    "maintenance refuses an active server-side write before claiming readiness metadata",
    async () => {
        const f = await contentMongo();
        const writer = new MongoClient(f.url, { appName: "content-maintenance-active-writer" });
        let pending: Promise<unknown> | undefined;
        try {
            await writer.connect();
            const db = f.client.db();
            await new MongoContentRepository(db).init();
            const before = await db.collection("content_metadata").find().toArray();
            await f.client.db("admin").command({
                configureFailPoint: "failCommand",
                mode: { times: 1 },
                data: {
                    failCommands: ["insert"],
                    appName: "content-maintenance-active-writer",
                    blockConnection: true,
                    blockTimeMS: 3000,
                },
            });
            pending = writer
                .db()
                .collection("probe")
                .insertOne({ value: "active" }, { comment: "active-writer-proof" });
            let active = false;
            const deadline = Date.now() + 2000;
            while (Date.now() < deadline) {
                const rows = await f.client
                    .db("admin")
                    .aggregate([
                        { $currentOp: { allUsers: true } },
                        { $match: { "command.comment": "active-writer-proof" } },
                        { $limit: 1 },
                    ])
                    .toArray();
                if (rows.length) {
                    active = true;
                    break;
                }
                await Bun.sleep(20);
            }
            expect(active).toBe(true);
            await expect(upgradeMongoContentReferences(db, { writersStopped: true })).rejects.toThrow(
                "Active Mongo writes",
            );
            expect(await db.collection("content_metadata").find().toArray()).toEqual(before);
            await pending;
            expect(await upgradeMongoContentReferences(db, { writersStopped: true })).toMatchObject({ complete: true });
        } finally {
            await pending?.catch(() => {});
            await writer.close();
            await f.close();
        }
    },
    60_000,
);
