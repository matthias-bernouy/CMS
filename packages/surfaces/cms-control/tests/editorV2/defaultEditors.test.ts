import { describe, expect, test } from "bun:test";
import {
    CMS_SNIPPET_TAG,
    Editor,
    type EditorCatalog,
    type SettingSection,
} from "@bernouy/cms-content/editor";
import {
    CardEditor,
    CodeEditor,
    ContainerEditor,
    GridEditor,
    ListEditor,
    ListItemEditor,
    ParagraphEditor,
    QuoteEditor,
    SnippetEditor,
    SpanEditor,
} from "cms-control/core/editorSystemV2/defaultEditors";
import { createControlEditorCatalog } from "cms-control/core/editorSystemV2/editorCatalog";

function target(tagName = "div"): HTMLElement {
    return document.createElement(tagName);
}

class RecordingEditor extends Editor {
    addedSettings: SettingSection[] = [];

    override addSettings(settings: SettingSection | SettingSection[]): void {
        this.addedSettings.push(...(Array.isArray(settings) ? settings : [settings]));
    }
}

class TestGridEditor extends GridEditor {
    constructor(target: HTMLElement, private readonly _children: Editor[]) {
        super(target);
    }

    override getChildren(): Editor[] {
        return this._children;
    }
}

describe("editor v2 default editors", () => {
    test("exposes layout editor settings", () => {
        expect(new ContainerEditor(target()).getSettings()[0]?.label).toBe("Container");
        expect(new GridEditor(target()).getSettings()[0]?.label).toBe("Grid");
        expect(new CardEditor(target()).getSettings()[0]?.label).toBe("Card");
    });

    test("exposes content editor identities", () => {
        expect(new ParagraphEditor(target("p")).getTextCapability()?.format).toBe("richtext");
        expect(new SpanEditor(target("span")).getTextCapability()?.format).toBe("richtext");
        expect(new CodeEditor(target("code")).getTextCapability()?.format).toBe("text");
        expect(new QuoteEditor(target("blockquote")).getTextCapability()?.format).toBe("richtext");
        expect(new ListEditor(target("ul")).getSettings()[0]?.label).toBe("List");
        expect(new ListItemEditor(target("li")).getSettings()[0]?.label).toBe("List item");
    });

    test("exposes default content slots", () => {
        expect(new ContainerEditor(target("p9r-container")).getContentSlots()).toEqual([
            {
                label: "Content",
                accepts: [{ kind: "any-component" }],
            },
        ]);

        expect(new CardEditor(target("p9r-card")).getContentSlots()).toEqual([
            {
                label: "Header",
                slot: "header",
                max: 1,
                accepts: [{ kind: "any-component" }],
            },
            {
                label: "Content",
                accepts: [{ kind: "any-component" }],
            },
            {
                label: "Footer",
                slot: "footer",
                accepts: [{ kind: "any-component" }],
            },
        ]);

        expect(new ListEditor(target("ul")).getContentSlots()).toEqual([
            {
                label: "Items",
                min: 1,
                accepts: [{ kind: "component", tag: "li" }],
            },
        ]);
        expect(new ParagraphEditor(target("p")).getContentSlots()).toEqual([]);
        expect(new SpanEditor(target("span")).getContentSlots()).toEqual([]);
        expect(new CodeEditor(target("code")).getContentSlots()).toEqual([]);
        expect(new QuoteEditor(target("blockquote")).getContentSlots()).toEqual([]);
        expect(new ListItemEditor(target("li")).getContentSlots()).toEqual([]);
    });

    test("exposes default text capabilities", () => {
        expect(new ParagraphEditor(target("p")).getTextCapability()).toEqual({
            format: "richtext",
            bold: true,
            italic: true,
            underline: true,
            link: true,
            color: true,
            dynamic: true,
        });
        expect(new ListItemEditor(target("li")).getTextCapability()).toEqual({
            format: "richtext",
            bold: true,
            italic: true,
            underline: true,
            link: true,
            color: true,
            dynamic: true,
        });
        expect(new SpanEditor(target("span")).getTextCapability()).toEqual({
            format: "richtext",
            bold: true,
            italic: true,
            underline: true,
            link: true,
            dynamic: true,
        });
        expect(new CodeEditor(target("code")).getTextCapability()).toEqual({
            format: "text",
            dynamic: true,
        });
        expect(new QuoteEditor(target("blockquote")).getTextCapability()).toEqual({
            format: "richtext",
            bold: true,
            italic: true,
            underline: true,
            link: true,
            dynamic: true,
        });
        expect(new CardEditor(target("p9r-card")).getTextCapability()).toBeNull();
    });

    test("grid mounts child override settings on its children", () => {
        const child = new RecordingEditor(target("p9r-card"));
        const editor = new TestGridEditor(target("p9r-grid"), [child]);

        expect(editor.getSettings()[0]?.kind).toBe("self");
        editor.mountEditor();

        expect(child.addedSettings).toEqual([
            {
                kind: "surcharge",
                label: "Grid item",
                settings: [
                    {
                        type: "select",
                        label: "Column span",
                        attribute: "grid-column",
                        defaultValue: "auto",
                        options: [
                            { label: "Auto", value: "auto" },
                            { label: "1 column", value: "span 1" },
                            { label: "2 columns", value: "span 2" },
                            { label: "3 columns", value: "span 3" },
                            { label: "Full row", value: "1 / -1" },
                        ],
                    },
                ],
            },
        ]);
    });

    test("catalog entries can bind bloc classes to control-owned editors", () => {
        class DemoBloc extends HTMLElement { }

        const catalog: EditorCatalog = [
            {
                tag: "demo-bloc",
                label: "Demo bloc",
                description: "A test bloc entry.",
                icon: "box",
                category: "Layout",
                subCategory: "Cards",
                bloc: DemoBloc,
                editor: CardEditor,
            },
        ];

        expect(catalog[0]?.bloc).toBe(DemoBloc);
        expect(catalog[0]?.editor).toBe(CardEditor);
        expect(catalog[0]?.subCategory).toBe("Cards");
    });

    test("control catalog exposes editor entries for known base elements", () => {
        const catalog = createControlEditorCatalog();

        expect(catalog.map(entry => entry.tag)).toEqual([
            "cms-binding-core",
            "p9r-container",
            "p9r-card",
            "p9r-grid",
            CMS_SNIPPET_TAG,
            "p",
            "span",
            "code",
            "blockquote",
            "ul",
            "ol",
            "li",
        ]);
        const snippet = catalog.find(entry => entry.tag === CMS_SNIPPET_TAG);
        expect(snippet?.editor).toBe(SnippetEditor);
        expect(snippet?.label).toBe("Snippet");
        expect(snippet?.category).toBe("Content");
        const container = catalog.find(entry => entry.tag === "p9r-container");
        expect(container?.editor).toBe(ContainerEditor);
        expect(container?.label).toBe("Container");
        expect(container?.category).toBe("Layout");
    });
});
