import { expect, test } from "bun:test";
import { MongoContentRepository } from "@bernouy/content/mongo";
import { ValidatingContentRepository, createCmsSiteBloc, readCmsSiteBloc, updateCmsSiteBloc } from "@bernouy/content";
import { contentMongo } from "./mongo";

const integration = process.env.ULVIA_RUN_CONTENT_LIFECYCLE === "1" ? test : test.skip;

integration(
    "real Mongo round-trips the maximum supported composition depth through editing and deletion",
    async () => {
        const fixture = await contentMongo();
        try {
            const raw = new MongoContentRepository(fixture.client.db());
            await raw.init();
            const repo = new ValidatingContentRepository(raw);
            await createCmsSiteBloc(repo, {
                tag: "site-deep",
                name: "Deep",
                group: "Site",
                content: "<section>".repeat(62) + "<p>Text</p>" + "</section>".repeat(62),
            });
            const read = await readCmsSiteBloc(repo, { tag: "site-deep" });
            expect(JSON.parse(read.draftJson).name).toBe("Deep");
            const saved = await updateCmsSiteBloc(repo, {
                tag: read.tag,
                definitionId: read.definitionId,
                revision: 1,
                draftJson: read.draftJson,
            });
            expect(saved.draftRevision).toBe(2);
            await repo.deleteSiteBloc(read.tag, 2, read.definitionId);
            expect(await repo.getBlocRecord(read.tag)).toBeNull();
        } finally {
            await fixture.close();
        }
    },
    60_000,
);
