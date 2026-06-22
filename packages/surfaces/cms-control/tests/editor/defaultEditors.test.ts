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
    HeadingEditor,
    ImageEditor,
    InputEditor,
    ListEditor,
    ListItemEditor,
    OptionEditor,
    ParagraphEditor,
    PhotoAlbumEditor,
    QuoteEditor,
    SelectEditor,
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

describe("editor default editors", () => {
    test("exposes layout editor settings", () => {
        expect(new ContainerEditor(target()).getSettings()[0]?.label).toBe("Container");
        expect(new GridEditor(target()).getSettings()[0]?.label).toBe("Grid");
        expect(new CardEditor(target()).getSettings()[0]?.label).toBe("Card");
    });

    test("exposes content editor identities", () => {
        expect(new ParagraphEditor(target("p")).getTextCapability()?.format).toBe("richtext");
        expect(new HeadingEditor(target("h1")).getTextCapability()?.format).toBe("richtext");
        expect(new SpanEditor(target("span")).getTextCapability()?.format).toBe("richtext");
        expect(new CodeEditor(target("code")).getTextCapability()?.format).toBe("text");
        expect(new QuoteEditor(target("blockquote")).getTextCapability()?.format).toBe("richtext");
        expect(new ImageEditor(target("img")).getSettings()[0]?.label).toBe("Image");
        expect(new InputEditor(target("input")).getSettings()[0]?.label).toBe("Text input");
        expect(new SelectEditor(target("select")).getSettings()[0]?.label).toBe("Select");
        expect(new OptionEditor(target("option")).getSettings()[0]?.label).toBe("Option");
        expect(new PhotoAlbumEditor(target("base-photo-album")).getSettings()[0]?.label).toBe("Photo album");
        expect(new ListEditor(target("ul")).getSettings()).toEqual([]);
        expect(new ListItemEditor(target("li")).getSettings()).toEqual([]);
    });

    test("exposes default content slots", () => {
        expect(new ContainerEditor(target("base-container")).getContentSlots()).toEqual([
            {
                label: "Content",
                accepts: [{ kind: "any-component" }],
            },
        ]);

        expect(new CardEditor(target("base-card")).getContentSlots()).toEqual([
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
        expect(new HeadingEditor(target("h1")).getContentSlots()).toEqual([]);
        expect(new ImageEditor(target("img")).getContentSlots()).toEqual([]);
        expect(new InputEditor(target("input")).getContentSlots()).toEqual([]);
        expect(new SelectEditor(target("select")).getContentSlots()).toEqual([
            {
                label: "Options",
                min: 1,
                accepts: [{ kind: "component", tag: "option" }],
            },
        ]);
        expect(new OptionEditor(target("option")).getContentSlots()).toEqual([]);
        expect(new PhotoAlbumEditor(target("base-photo-album")).getContentSlots()).toEqual([
            {
                label: "Images",
                slot: "images",
                accepts: [{ kind: "media", accept: ["image"] }],
            },
        ]);
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
            size: true,
            dynamic: true,
        });
        expect(new ListItemEditor(target("li")).getTextCapability()).toEqual({
            format: "richtext",
            bold: true,
            italic: true,
            underline: true,
            link: true,
            color: true,
            size: true,
            dynamic: true,
        });
        expect(new HeadingEditor(target("h1")).getTextCapability()).toEqual({
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
        expect(new OptionEditor(target("option")).getTextCapability()).toEqual({
            format: "text",
            dynamic: true,
        });
        expect(new CardEditor(target("base-card")).getTextCapability()).toBeNull();
        expect(new ImageEditor(target("img")).getTextCapability()).toBeNull();
    });

    test("image editor exposes source and intrinsic attribute settings", () => {
        expect(new ImageEditor(target("img")).getSettings()).toEqual([
            {
                kind: "self",
                label: "Image",
                settings: [
                    {
                        type: "page-link",
                        label: "Source",
                        attribute: "src",
                        allowPage: false,
                        allowExternal: false,
                        allowMedia: true,
                    },
                    {
                        type: "text",
                        label: "Alt text",
                        attribute: "alt",
                    },
                    {
                        type: "text",
                        label: "Width",
                        attribute: "width",
                    },
                    {
                        type: "text",
                        label: "Height",
                        attribute: "height",
                    },
                ],
            },
        ]);
    });

    test("grid mounts child override settings on its children", () => {
        const child = new RecordingEditor(target("base-card"));
        const editor = new TestGridEditor(target("base-grid"), [child]);

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
            CMS_SNIPPET_TAG,
            "p",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "img",
            "input",
            "select",
            "option",
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
        const h1 = catalog.find(entry => entry.tag === "h1");
        expect(h1?.editor).toBe(HeadingEditor);
        expect(h1?.label).toBe("Heading 1");
        expect(h1?.defaultContent).toBe("<h1>Heading</h1>");
        const image = catalog.find(entry => entry.tag === "img");
        expect(image?.editor).toBe(ImageEditor);
        expect(image?.label).toBe("Image");
        expect(image?.category).toBe("Media");
        const input = catalog.find(entry => entry.tag === "input");
        expect(input?.editor).toBe(InputEditor);
        expect(input?.defaultContent).toBe(`<input type="text" name="search" placeholder="Search">`);
        const select = catalog.find(entry => entry.tag === "select");
        expect(select?.editor).toBe(SelectEditor);
        expect(select?.defaultContent).toBe(`<select name="choice"><option value="option">Option</option></select>`);
        const option = catalog.find(entry => entry.tag === "option");
        expect(option?.editor).toBe(OptionEditor);
        expect(option?.defaultContent).toBe(`<option value="option">Option</option>`);
    });
});
