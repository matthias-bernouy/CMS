import { expect, test } from "bun:test";
import { renderPreviewCollectionTexts } from "cms-control/core/content/installedCollections/renderTexts";
import { parseHTML } from "linkedom";

test("fixed collection text rendering preserves authored slot input", () => {
    const document = parseHTML(`<main>
        <test-card data-p9r-component-composition>
            <template data-p9r-composition-input><h2 slot="title">{{ cms.i18n.test.title }}</h2></template>
            <!--p9r-component-output-start-->
            <h2 data-p9r-composition-authored="title">{{ cms.i18n.test.title }}</h2>
            <p>{{ cms.i18n.test.title }}</p>
            <!--p9r-component-output-end-->
        </test-card>
    </main>`).document;

    renderPreviewCollectionTexts(document.querySelector("main")!, "en", [
        {
            collection: {
                collectionId: "test",
                locale: "en",
                texts: [{ id: "title", parameters: {}, values: { en: "Shared title" } }],
            },
        },
    ]);

    expect(document.querySelector("p")?.textContent).toBe("Shared title");
    expect(document.querySelector("h2")?.textContent).toBe("{{ cms.i18n.test.title }}");
    expect(document.querySelector("template")?.innerHTML).toContain("{{ cms.i18n.test.title }}");
});
