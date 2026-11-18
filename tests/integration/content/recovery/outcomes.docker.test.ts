import { expect, test } from "bun:test";
import { MongoTopologyClosedError } from "mongodb";
import type { Collection, Document } from "mongodb";
import { MongoContentRepository } from "@bernouy/content/mongo";
import { ValidatingContentRepository, createCmsSiteBloc, publishCmsSiteBloc } from "@bernouy/content";
import { recoverMongoContentReferenceFence } from "@bernouy/content/mongo/maintenance";
import { contentMongo } from "../mongo";

const integration = process.env.ULVIA_RUN_CONTENT_LIFECYCLE === "1" ? test : test.skip;

integration(
    "a real Mongo write reconciled after a lost acknowledgement releases its fence",
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
            await publishCmsSiteBloc(repo, { tag: "site-target", revision: 1 });
            const pages = Reflect.get(raw, "pages") as Collection<Document>;
            const insert = Object.getPrototypeOf(pages).insertOne;
            pages.insertOne = async (...args) => {
                await insert.apply(pages, args);
                throw new Error("Acknowledgement lost after storage applied the exact Page");
            };
            await repo.insertPage("/applied", "Applied", '<div cms-bloc="site-target"></div>');
            pages.insertOne = insert;
            expect((await repo.getPage("/applied"))?.title).toBe("Applied");
            expect(
                await f.client
                    .db()
                    .collection("site_bloc_publication_locks")
                    .findOne({ _id: "published-graph" } as never),
            ).toBeNull();
            await repo.insertPage("/next", "Next", '<div cms-bloc="site-target"></div>');
            expect(await repo.getPage("/next")).not.toBeNull();
        } finally {
            await f.close();
        }
    },
    60_000,
);

integration(
    "a pre-send failure is distinguished from a sent unknown result using command evidence",
    async () => {
        const f = await contentMongo();
        try {
            const raw = new MongoContentRepository(f.client.db());
            await raw.init();
            const repo = new ValidatingContentRepository(raw);
            const blocs = Reflect.get(raw, "blocs") as Collection<Document>;
            const insert = Object.getPrototypeOf(blocs).insertOne;
            const failure = new MongoTopologyClosedError();
            blocs.insertOne = async () => {
                throw failure;
            };
            await expect(
                createCmsSiteBloc(repo, { tag: "site-first", name: "First", group: "Site", content: "<p>First</p>" }),
            ).rejects.toBe(failure);
            expect(
                await f.client
                    .db()
                    .collection("site_bloc_publication_locks")
                    .findOne({ _id: "published-graph" } as never),
            ).toBeNull();
            blocs.insertOne = insert;
            await createCmsSiteBloc(repo, { tag: "site-next", name: "Next", group: "Site", content: "<p>Next</p>" });
            const identity = (await repo.getBlocRecord("site-next"))!.siteDefinition!.id;
            await f.client.db("admin").command({
                configureFailPoint: "failCommand",
                mode: { times: 1 },
                data: {
                    failCommands: ["delete"],
                    appName: "content-lifecycle-parent",
                    closeConnection: true,
                },
            });
            await expect(repo.deleteSiteBloc("site-next", 1, identity)).rejects.toThrow();
            const locks = f.client.db().collection<Document & { _id: string }>("site_bloc_publication_locks");
            const held = (await locks.findOne({ _id: "published-graph" }))!;
            expect(held.phase).toBe("committing");
            await expect(
                recoverMongoContentReferenceFence(f.client.db(), { writersStopped: true, expectedToken: held.token }),
            ).resolves.toMatchObject({ recovered: true });
            expect(await locks.findOne({ _id: "published-graph" })).toBeNull();
            await createCmsSiteBloc(repo, { tag: "site-after", name: "After", group: "Site", content: "<p>After</p>" });
        } finally {
            await f.close();
        }
    },
    60_000,
);
