import { describe, expect, test } from "bun:test";
import { generateSiteBlocSourceBundle } from "@bernouy/cms-bloc-compile";
import getBlocsList from "cms-control/api/_content/bloc/list.get";
import getBlocSource from "cms-control/api/_content/bloc/source.get";
import { blocArtifact, seedSiteBloc, siteBlocHarness, siteSnapshot } from "../../site-blocs/fixtures";

describe("CLI site-bloc export", () => {
    test("lists and materializes a draft-only definition", async () => {
        const { cms, repository } = siteBlocHarness();
        const definition = await seedSiteBloc(repository, "site-shell", siteSnapshot({ group: "Draft layouts" }));

        const list = await getBlocsList(new Request("http://cms.test/api/bloc/list"), cms);
        expect(await list.json()).toEqual([
            {
                id: definition.tag,
                name: definition.draft.name,
                group: "Draft layouts",
                description: definition.draft.description,
                ownership: definition.ownership,
            },
        ]);

        const source = await sourceResponse(cms, definition.tag);
        expect(Object.keys(source).sort()).toEqual([
            "BlocEditor.ts",
            "builder.json",
            "default.html",
            "manifest.json",
            "template.html",
        ]);
        expect(decodedJson(source["builder.json"]!).createdAt).toBe(definition.createdAt.toISOString());
    });

    test("keeps published files but exports the current draft, lifecycle, dates and ownership", async () => {
        const { cms, repository } = siteBlocHarness();
        const definition = await seedSiteBloc(repository, "site-shell", siteSnapshot({ group: "Published" }));
        const publishedSource = encodeBundle(generateSiteBlocSourceBundle(definition, definition.draft));
        await repository.publishSiteBloc(
            definition.tag,
            blocArtifact(definition.tag, { ownership: definition.ownership, source: publishedSource }),
            definition.draftRevision,
        );
        const saved = await repository.saveSiteBlocDraft(
            definition.tag,
            { ...definition.draft, name: "Current draft", group: "Draft layouts" },
            definition.draftRevision,
        );
        await repository.archiveSiteBloc(definition.tag, saved.draftRevision);

        const list = await getBlocsList(new Request("http://cms.test/api/bloc/list"), cms);
        expect((await list.json())[0]).toMatchObject({ name: "Current draft", group: "Draft layouts" });
        const source = await sourceResponse(cms, definition.tag);
        for (const path of ["manifest.json", "BlocEditor.ts", "template.html", "default.html"]) {
            expect(source[path]).toBe(publishedSource[path]);
        }
        const builder = decodedJson(source["builder.json"]!);
        expect(builder).toMatchObject({
            lifecycle: "archived",
            ownership: definition.ownership,
            draft: { name: "Current draft", group: "Draft layouts" },
            published: { group: "Published" },
        });
        expect(typeof builder.archivedAt).toBe("string");
        expect(builder.updatedAt).toBe(builder.archivedAt);
    });
});

async function sourceResponse(cms: ReturnType<typeof siteBlocHarness>["cms"], tag: string) {
    const response = await getBlocSource(new Request(`http://cms.test/api/bloc/source?tag=${tag}`), cms);
    expect(response.status).toBe(200);
    return (await response.json()).source as Record<string, string>;
}

function encodeBundle(bundle: Record<string, string>): Record<string, string> {
    return Object.fromEntries(
        Object.entries(bundle).map(([path, content]) => [path, Buffer.from(content, "utf-8").toString("base64")]),
    );
}

function decodedJson(value: string): Record<string, any> {
    return JSON.parse(Buffer.from(value, "base64").toString("utf-8"));
}
