import { describe, expect, test } from "bun:test";
import {
    findPagesReferencingBloc,
    findPagesReferencingFile,
    findPagesReferencingText,
    InMemoryContentRepository,
    pageContentReferenceKeys,
} from "@bernouy/cms-content";

describe("Page content reference projection", () => {
    test("extracts unique Bloc, file, text, and authored Page paths", () => {
        expect(
            pageContentReferenceKeys(
                '<div cms-bloc=\"official-card\"><a href="/target"><img src="/.cms/call/ulvia.cms.files/files/file%201/generation?v=abc">{{ cms.i18n.ulvia-official.card-title }}</a></div>',
            ),
        ).toEqual(["bloc:official-card", "file:file 1", "page-path:/target", "text:ulvia-official:card-title"]);
    });

    test("updates reverse lookups without enumerating Pages", async () => {
        const repository = new InMemoryContentRepository();
        await repository.insertPage(
            "/card",
            "Card",
            '<div cms-bloc=\"official-card\"><img src="/.cms/call/ulvia.cms.files/files/file%201/generation">{{ cms.i18n.ulvia-official.card-title }}</div>',
        );
        const page = (await repository.getPage("/card"))!;

        expect((await findPagesReferencingBloc(repository, "official-card")).map(({ id }) => id)).toEqual([page.id]);
        expect(
            (await findPagesReferencingText(repository, "cms.i18n.ulvia-official.card-title")).map(({ id }) => id),
        ).toEqual([page.id]);
        expect((await findPagesReferencingFile(repository, "file 1")).map(({ id }) => id)).toEqual([page.id]);

        await repository.updatePage({ id: page.id, content: "<main>Empty</main>" }, page.revision);
        expect(await findPagesReferencingBloc(repository, "official-card")).toEqual([]);
        expect(await findPagesReferencingText(repository, "{{ cms.i18n.ulvia-official.card-title }}")).toEqual([]);
        expect(await findPagesReferencingFile(repository, "file 1")).toEqual([]);
    });
});
