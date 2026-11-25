import { describe, expect, test } from "bun:test";
import {
    InMemoryContentRepository,
    ValidatingContentRepository,
    createCmsSiteBloc,
    listCmsSiteBlocs,
    publishCmsSiteBloc,
} from "@bernouy/content";
import { siteBlocStructureFromMarkup } from "content/blocs/core/catalogue/siteBlocMarkup";
import { serializeSiteBlocMarkup } from "content/blocs/core/publication/source/siteBlocHtml";

describe("site Bloc contracts", () => {
    test("creates and publishes an opaque site composition", async () => {
        const repository = new ValidatingContentRepository(new InMemoryContentRepository());
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

    test("publishes allowed inline rich text and retains component root restrictions", async () => {
        const repository = new ValidatingContentRepository(new InMemoryContentRepository());
        const content =
            "<section><p>A <strong>bold</strong>, <em>emphasized</em> and <code>code</code> text.</p></section>";
        const created = await createCmsSiteBloc(repository, {
            tag: "site-rich-text",
            name: "Rich text",
            group: "Site",
            content,
        });
        await publishCmsSiteBloc(repository, { tag: created.tag, revision: created.draftRevision });
        expect((await repository.getBlocRecord(created.tag))?.artifact?.markupHTML).toBe(`${content}\n`);
        const snapshot = (await repository.getBlocRecord(created.tag))!.siteDefinition!.published!;
        expect(() =>
            serializeSiteBlocMarkup({
                ...snapshot,
                structure: [{ kind: "bloc", tag: "fixture-component", root: "strong", attributes: {}, children: [] }],
            }),
        ).toThrow("Invalid native root");
        expect(() =>
            serializeSiteBlocMarkup({
                ...snapshot,
                structure: [{ kind: "bloc", tag: "strong", attributes: {}, children: [] }],
            }),
        ).toThrow("inside rich text");
    });

    test("preserves the native root carrying a component Bloc", async () => {
        const structure = siteBlocStructureFromMarkup(
            '<section cms-bloc="ulvia--mossa--hero" tone="soft"><p>Welcome</p></section>',
        );
        expect(structure[0]).toMatchObject({ kind: "bloc", tag: "ulvia--mossa--hero", root: "section" });
        expect(
            serializeSiteBlocMarkup(
                {
                    name: "Hero",
                    group: "Site",
                    description: "",
                    structure,
                    slots: [],
                    defaultContent: "",
                    dependencies: ["ulvia--mossa--hero"],
                },
                { controller: false },
            ),
        ).toBe('<section cms-bloc="ulvia--mossa--hero" tone="soft"><p>Welcome</p></section>\n');

        const repository = new ValidatingContentRepository(new InMemoryContentRepository());
        await expect(
            createCmsSiteBloc(repository, {
                tag: "site-hero",
                name: "Hero",
                group: "Site",
                content: '<div cms-bloc="ulvia--mossa--hero" tone="soft"><p>Welcome</p></div>',
            }),
        ).resolves.toMatchObject({ tag: "site-hero", draftRevision: 1 });
    });
});
