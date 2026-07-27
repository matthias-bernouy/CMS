import { describe, expect, test } from "bun:test";
import { ContentValidationError, P9R_CACHE } from "@bernouy/cms-content";
import { createSiteBloc, publishSiteBloc, saveSiteBloc } from "cms-control/core/content/siteBloc/service";
import { seedBloc, siteBlocHarness, siteSnapshot } from "./fixtures";

function validSnapshot() {
    return siteSnapshot({
        name: "Published feature",
        structure: [
            {
                kind: "bloc",
                tag: "basic-section",
                attributes: { tone: "soft" },
                children: [{ kind: "slot", slotId: "body" }],
            },
        ],
        slots: [
            {
                id: "body",
                label: "Body",
                accepts: [{ kind: "component", tag: "basic-card" }],
            },
        ],
        defaultContent: "<basic-card></basic-card>",
    });
}

async function publicationFixture() {
    const fixture = siteBlocHarness();
    const { cms, repository, cache } = fixture;
    await seedBloc(repository, "basic-section");
    await seedBloc(repository, "basic-card");
    await createSiteBloc(cms, {
        tag: "site-published-feature",
        name: "Published feature",
        group: "Site",
        description: "",
    });
    const snapshot = validSnapshot();
    await saveSiteBloc(cms, "site-published-feature", {
        expectedDraftRevision: 1,
        name: snapshot.name,
        group: snapshot.group,
        description: snapshot.description,
        defaultContent: snapshot.defaultContent,
        snapshot,
    });
    await repository.insertPage("/home", "Home");
    const page = await repository.getPage("/home");
    await repository.updatePage({ ...page!, content: "<site-published-feature></site-published-feature>" });
    cache.keys.add("blocset:old-signature");
    return fixture;
}

describe("site bloc publication", () => {
    test("persists the compiled artifact and published snapshot before invalidating dependent caches", async () => {
        const { cms, repository, cache } = await publicationFixture();

        const published = await publishSiteBloc(cms, "site-published-feature", 2);
        const record = await repository.getBlocRecord("site-published-feature");

        expect(published.publishedRevision).toBe(2);
        expect(published.published).toEqual(published.draft);
        expect(record?.artifact).toMatchObject({
            id: "site-published-feature",
            name: "Published feature",
            ownership: published.ownership,
        });
        expect(record?.artifact?.source).toEqual({
            "Bloc.ts": expect.any(String),
            "BlocEditor.ts": expect.any(String),
            "builder.json": expect.any(String),
            "default.html": expect.any(String),
            "manifest.json": expect.any(String),
            "template.html": expect.any(String),
        });
        const builder = Buffer.from(record!.artifact!.source!["builder.json"]!, "base64").toString("utf-8");
        expect(JSON.parse(builder)).toEqual(JSON.parse(JSON.stringify(published)));
        expect(cache.deleted).toEqual(
            expect.arrayContaining([
                P9R_CACHE.bloc("site-published-feature"),
                P9R_CACHE.EDITOR_SCRIPT,
                P9R_CACHE.EDITOR_VIEW_SCRIPT,
                "blocset:old-signature",
                P9R_CACHE.page("/home"),
            ]),
        );
    });

    test("keeps the previous publication and caches intact when draft compilation fails", async () => {
        const { cms, repository, cache } = await publicationFixture();
        await publishSiteBloc(cms, "site-published-feature", 2);
        const previous = await repository.getBlocRecord("site-published-feature");
        const broken = validSnapshot();
        broken.structure = [
            {
                kind: "bloc",
                tag: "basic-section",
                attributes: { "cms-source": "/private" },
                children: [{ kind: "slot", slotId: "body" }],
            },
        ];
        await repository.saveSiteBlocDraft("site-published-feature", broken, 2);
        cache.reset();

        await expect(publishSiteBloc(cms, "site-published-feature", 3)).rejects.toBeInstanceOf(ContentValidationError);
        const current = await repository.getBlocRecord("site-published-feature");

        expect(current?.artifact).toEqual(previous?.artifact);
        expect(current?.siteDefinition?.published).toEqual(previous?.siteDefinition?.published);
        expect(current?.siteDefinition?.publishedRevision).toBe(2);
        expect(current?.siteDefinition?.draftRevision).toBe(3);
        expect(cache.deleted).toEqual([]);
    });

    test("serializes graph validation so concurrent publications cannot create a cycle", async () => {
        const { cms, repository } = siteBlocHarness();
        for (const tag of ["site-cycle-a", "site-cycle-b"]) {
            await createSiteBloc(cms, { tag, name: tag, group: "Site", description: "" });
            await publishSiteBloc(cms, tag, 1);
        }
        const dependencySnapshot = (tag: string) =>
            siteSnapshot({
                structure: [{ kind: "bloc" as const, tag, attributes: {}, children: [] }],
                dependencies: [tag],
            });
        await repository.saveSiteBlocDraft("site-cycle-a", dependencySnapshot("site-cycle-b"), 1);
        await repository.saveSiteBlocDraft("site-cycle-b", dependencySnapshot("site-cycle-a"), 1);

        const attempts = await Promise.allSettled([
            publishSiteBloc(cms, "site-cycle-a", 2),
            publishSiteBloc(cms, "site-cycle-b", 2),
        ]);

        expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
        const rejection = attempts.find((attempt) => attempt.status === "rejected") as PromiseRejectedResult;
        expect(rejection.reason).toBeInstanceOf(ContentValidationError);
        expect(rejection.reason.message).toContain("dependency cycle detected");
        const records = await repository.getBlocRecords();
        const publishedDependencies = records
            .filter((record) => record.tag.startsWith("site-cycle-"))
            .map((record) => record.siteDefinition?.published?.dependencies ?? []);
        expect(publishedDependencies.filter((dependencies) => dependencies.length > 0)).toHaveLength(1);
    });
});
