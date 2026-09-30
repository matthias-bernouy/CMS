import { expect, test } from "bun:test";
import type { BlocRecord } from "@bernouy/cms-content";
import { installedCollectionEditorScript } from "cms-control/core/content/installedCollections/editorScript";
import { renderEditorCollectionTexts } from "cms-control/core/content/installedCollections/renderTexts";
import { parseHTML } from "linkedom";

test("installed collection editor inserts page defaults and exposes only declared slots", () => {
    const records: BlocRecord[] = [
        {
            tag: "test-card",
            collectionId: "test",
            ownership: { kind: "code-managed" },
            artifact: {
                id: "test-card",
                name: "Card",
                group: "Test",
                description: "Shared card",
                ownership: { kind: "code-managed" },
                viewJS: "customElements.define('test-card', class extends HTMLElement {})",
                editorJS: "",
                componentHTML: '<p slot="body">Shared</p>',
                defaultContent: '<h2 slot="body">Page title</h2>',
                collectionSlots: { body: { max: 2, accepts: ["test-heading"] } },
                collectionSettings: [
                    {
                        id: "tone",
                        label: "Tone",
                        group: "Appearance",
                        type: "string",
                        enum: ["quiet", "accent"],
                        maxLength: 16,
                        default: "quiet",
                    },
                    {
                        id: "compact",
                        label: "Compact",
                        group: "Layout",
                        type: "boolean",
                        default: false,
                        visibleWhen: [{ setting: "tone", equals: "accent" }],
                    },
                ],
            },
        },
    ];
    const registrations: Record<string, unknown>[] = [];
    const runtime = {
        p9rEditor: {
            Editor: class {},
            registerEditor(entry: Record<string, unknown>) {
                registrations.push(entry);
            },
        },
    };

    new Function("window", installedCollectionEditorScript(records))(runtime);

    const entry = registrations[0]!;
    expect(entry.defaultContent).toBe('<test-card tone="quiet"><h2 slot="body">Page title</h2></test-card>');
    const Editor = entry.editor as new () => { contentSlots(): unknown[]; settings(): unknown[] };
    expect(new Editor().contentSlots()).toEqual([
        { label: "body", slot: "body", max: 2, accepts: [{ kind: "component", tag: "test-heading" }] },
    ]);
    expect(new Editor().settings()).toEqual([
        {
            kind: "self",
            label: "Appearance",
            settings: [
                {
                    label: "Tone",
                    attribute: "tone",
                    type: "select",
                    options: [
                        { label: "Quiet", value: "quiet" },
                        { label: "Accent", value: "accent" },
                    ],
                },
            ],
        },
        {
            kind: "self",
            label: "Layout",
            settings: [
                {
                    label: "Compact",
                    attribute: "compact",
                    type: "toggle",
                    visibleWhen: [{ attribute: "tone", equals: "accent" }],
                },
            ],
        },
    ]);
});

test("editor resolves fixed collection text without changing authored slot input", () => {
    const document = parseHTML(`<main>
        <test-card data-p9r-component-composition>
            <template data-p9r-composition-input><h2 slot="title">{{ cms.i18n.test.title }}</h2></template>
            <!--p9r-component-output-start-->
            <h2 data-p9r-composition-authored="title">{{ cms.i18n.test.title }}</h2>
            <p>{{ cms.i18n.test.title }}</p>
            <!--p9r-component-output-end-->
        </test-card>
    </main>`).document;

    renderEditorCollectionTexts(document.querySelector("main")!, "en", [
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
