import { describe, expect, test } from "bun:test";
import {
    findPagesReferencingBloc,
    findPagesReferencingText,
    InMemoryCmsRepository,
    pageContentReferenceKeys,
} from "@bernouy/cms-content";

describe("Page content reference projection", () => {
    test("extracts unique bloc, text, and stable Page references", () => {
        const target = JSON.stringify({ kind: "site", pageId: "target-page" });
        expect(
            pageContentReferenceKeys(
                `<official-card><a data-cms-page-ref='${target}'>{{ cms.i18n.ulvia-official.card-title }}</a></official-card>`,
            ),
        ).toEqual(["bloc:official-card", "site-page:target-page", "text:ulvia-official:card-title"]);
    });

    test("updates reverse lookups without enumerating Pages", async () => {
        const repository = new InMemoryCmsRepository();
        await repository.insertPage(
            "/card",
            "Card",
            "<official-card>{{ cms.i18n.ulvia-official.card-title }}</official-card>",
        );
        const page = (await repository.getPage("/card"))!;

        expect((await findPagesReferencingBloc(repository, "official-card")).map(({ id }) => id)).toEqual([page.id]);
        expect(
            (await findPagesReferencingText(repository, "cms.i18n.ulvia-official.card-title")).map(({ id }) => id),
        ).toEqual([page.id]);

        await repository.updatePage({ id: page.id, content: "<main>Empty</main>" }, page.revision);
        expect(await findPagesReferencingBloc(repository, "official-card")).toEqual([]);
        expect(await findPagesReferencingText(repository, "{{ cms.i18n.ulvia-official.card-title }}")).toEqual([]);
    });
});
