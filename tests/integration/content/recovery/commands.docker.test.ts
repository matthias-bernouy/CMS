import { expect, test } from "bun:test";
import { MongoClient } from "mongodb";
import type { Collection, Document } from "mongodb";
import { MongoContentRepository } from "@bernouy/content/mongo";
import { createCmsSiteBloc, ValidatingContentRepository } from "@bernouy/content";
import { contentMongo } from "../mongo";

const integration = process.env.ULVIA_RUN_CONTENT_LIFECYCLE === "1" ? test : test.skip;

integration(
    "find-and-modify and bulk writes use the same fence; unsupported writes refuse before execution",
    async () => {
        const f = await contentMongo();
        try {
            const raw = new MongoContentRepository(f.client.db());
            await raw.init();
            const repo = new ValidatingContentRepository(raw);
            await createCmsSiteBloc(repo, {
                tag: "site-target",
                name: "Target",
                group: "Site",
                content: "<p>Target</p>",
            });
            const blocs = Reflect.get(raw, "blocs") as Collection<Document>;
            const locks = f.client.db().collection<Document & { _id: string }>("site_bloc_publication_locks");
            const sent: string[] = [];
            f.client.on("commandStarted", (event) => {
                if (event.command.comment?.startsWith("ulvia-content:")) {
                    sent.push(event.commandName);
                }
            });
            await raw.withContentReferenceWrite(async () => {
                await blocs.findOneAndUpdate(
                    { _id: "site-target" },
                    { $set: { "siteDefinition.draft.name": "First" } },
                );
                await blocs.bulkWrite([
                    {
                        updateOne: {
                            filter: { _id: "site-target" },
                            update: { $set: { "siteDefinition.draft.name": "Second" } },
                        },
                    },
                ]);
            });
            expect(sent).toEqual(["findAndModify", "update"]);
            expect(await locks.findOne({ _id: "published-graph" })).toBeNull();
            const before = await raw.getBlocRecord("site-target");
            for (const stage of [{ $merge: "blocs" }, { $out: "blocs" }]) {
                await expect(
                    raw.withContentReferenceWrite(async () => {
                        await blocs.aggregate([stage]).toArray();
                    }),
                ).rejects.toThrow("Unsupported reference storage operation");
            }
            await expect(
                raw.withContentReferenceWrite(async () => {
                    await blocs.rename("bypass");
                }),
            ).rejects.toThrow("Unsupported reference storage operation");
            expect(await raw.getBlocRecord("site-target")).toEqual(before);
            for (const write of [
                () =>
                    blocs.findOneAndUpdate(
                        { _id: "site-target" },
                        { $set: { "siteDefinition.draft.name": "Forbidden" } },
                    ),
                () => blocs.bulkWrite([{ deleteOne: { filter: { _id: "site-target" } } }]),
            ]) {
                await expect(
                    raw.withContentReferenceWrite(async () => {
                        const current = (await locks.findOne({ _id: "published-graph" }))!;
                        await locks.updateOne(
                            { _id: current._id, token: current.token },
                            { $set: { token: "successor" } },
                        );
                        await write();
                    }),
                ).rejects.toThrow();
                expect(await raw.getBlocRecord("site-target")).toEqual(before);
                expect((await locks.findOne({ _id: "published-graph" }))?.token).toBe("successor");
                await locks.deleteOne({ _id: "published-graph", token: "successor" });
            }
        } finally {
            await f.close();
        }
    },
    60_000,
);

integration(
    "missing command monitoring refuses before a business mutation and leaves no fence",
    async () => {
        const f = await contentMongo();
        const unmonitored = new MongoClient(f.url);
        try {
            await unmonitored.connect();
            const raw = new MongoContentRepository(unmonitored.db());
            await raw.init();
            await expect(
                createCmsSiteBloc(new ValidatingContentRepository(raw), {
                    tag: "site-refused",
                    name: "Refused",
                    group: "Site",
                    content: "<p>Refused</p>",
                }),
            ).rejects.toThrow("monitorCommands");
            expect(await raw.getBlocRecord("site-refused")).toBeNull();
            expect(
                await f.client
                    .db()
                    .collection("site_bloc_publication_locks")
                    .findOne({ _id: "published-graph" } as never),
            ).toBeNull();
        } finally {
            await unmonitored.close();
            await f.close();
        }
    },
    60_000,
);
