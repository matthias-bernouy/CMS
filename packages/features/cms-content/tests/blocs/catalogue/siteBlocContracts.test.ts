import { describe, expect, test } from "bun:test";
import {
    InMemoryCmsRepository,
    ValidatingCmsRepository,
    createCmsSiteBloc,
    listCmsSiteBlocs,
    publishCmsSiteBloc,
} from "@bernouy/cms-content";
import { siteBlocStructureFromMarkup } from "cms-content/blocs/core/catalogue/siteBlocMarkup";
import { serializeSiteBlocMarkup } from "cms-content/blocs/core/publication/source/siteBlocHtml";

describe("site Bloc contracts", () => {
    test("creates and publishes an opaque site composition", async () => {
        const repository = new ValidatingCmsRepository(new InMemoryCmsRepository());
        const created = await createCmsSiteBloc(repository, {
            tag: "site-introduction",
            name: "Introduction",
            group: "Site",
            content: "<section><p>Welcome</p></section>",
        });

        expect(created).toMatchObject({ tag: "site-introduction", draftRevision: 1, publishedRevision: null });
        const published = await publishCmsSiteBloc(repository, { tag: created.tag, revision: created.draftRevision });
        expect(published.publishedRevision).toBe(1);
        expect((await repository.getBlocRecord(created.tag))?.artifact).toMatchObject({
            kind: "composition",
            markupHTML: "<section><p>Welcome</p></section>\n",
            viewJS: "",
        });
        expect((await listCmsSiteBlocs(repository)).items).toHaveLength(1);
    });

    test("preserves the native root carrying a component Bloc", async () => {
        const structure = siteBlocStructureFromMarkup(
            '<section cms-bloc="ulvia-official-hero" tone="soft"><p>Welcome</p></section>',
        );
        expect(structure[0]).toMatchObject({ kind: "bloc", tag: "ulvia-official-hero", root: "section" });
        expect(
            serializeSiteBlocMarkup(
                {
                    name: "Hero",
                    group: "Site",
                    description: "",
                    structure,
                    slots: [],
                    defaultContent: "",
                    dependencies: ["ulvia-official-hero"],
                },
                { controller: false },
            ),
        ).toBe('<section cms-bloc="ulvia-official-hero" tone="soft"><p>Welcome</p></section>\n');

        const repository = new ValidatingCmsRepository(new InMemoryCmsRepository());
        await expect(
            createCmsSiteBloc(repository, {
                tag: "site-hero",
                name: "Hero",
                group: "Site",
                content: '<div cms-bloc="ulvia-official-hero" tone="soft"><p>Welcome</p></div>',
            }),
        ).resolves.toMatchObject({ tag: "site-hero", draftRevision: 1 });
    });
});
