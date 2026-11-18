import { expect, test } from "bun:test";
import type { CommandStartedEvent, Document } from "mongodb";
import { ValidatingContentRepository, createCmsSiteBloc, readCmsSiteBloc } from "@bernouy/content";
import { MongoContentRepository } from "@bernouy/content/mongo";
import { contentMongo } from "./mongo";

const integration = process.env.ULVIA_RUN_CONTENT_LIFECYCLE === "1" ? test : test.skip;

integration(
    "deleting an unused composition examines bounded Mongo documents as unrelated catalogue size grows",
    async () => {
        const fixture = await contentMongo();
        try {
            const db = fixture.client.db();
            const raw = new MongoContentRepository(db);
            await raw.init();
            const repository = new ValidatingContentRepository(raw);
            await createCmsSiteBloc(repository, {
                tag: "site-target",
                name: "Target",
                group: "Site",
                content: "<p>Target</p>",
            });
            const target = await readCmsSiteBloc(repository, { tag: "site-target" });
            await raw.createBloc({
                id: "code-template",
                kind: "composition",
                name: "Template",
                group: "Code",
                description: "",
                root: { accepts: ["div"] },
                viewJS: "",
                markupHTML: "<p>Unrelated</p>",
            });
            const template = (await db.collection("blocs").findOne({ _id: "code-template" } as Document))!;
            await db.collection("blocs").insertMany(
                Array.from({ length: 512 }, (_, index) => {
                    const id = `unrelated-${index}`;
                    return { ...template, _id: id, artifact: { ...template.artifact, id } };
                }),
            );
            const searches: Document[] = [];
            const observe = ({ commandName, command }: CommandStartedEvent) => {
                if (commandName === "find" && command.find === "blocs" && command.projection) {
                    searches.push(command);
                }
            };
            fixture.client.on("commandStarted", observe);
            await repository.deleteSiteBloc(target.tag, 1, target.definitionId);
            fixture.client.off("commandStarted", observe);
            expect(await repository.getBlocRecord(target.tag)).toBeNull();
            expect(searches.length).toBeGreaterThan(0);
            let examined = 0;
            for (const search of searches) {
                const { executionStats } = await db.command({
                    explain: {
                        find: "blocs",
                        filter: search.filter,
                        projection: search.projection,
                        ...(search.sort ? { sort: search.sort } : {}),
                        ...(search.limit ? { limit: search.limit } : {}),
                    },
                    verbosity: "executionStats",
                });
                examined += executionStats.totalDocsExamined;
            }
            expect(
                examined,
                "an empty reverse-reference lookup must not scan the 512 unrelated Bloc documents",
            ).toBeLessThanOrEqual(32);
        } finally {
            await fixture.close();
        }
    },
    60_000,
);
