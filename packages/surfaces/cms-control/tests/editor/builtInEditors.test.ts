import { describe, expect, test } from "bun:test";
import {
    CMS_SNIPPET_TAG,
} from "@bernouy/cms-content/editor";
import {
    CodeEditor,
    HeadingEditor,
    ImageEditor,
    InputEditor,
    LinkEditor,
    ListEditor,
    ListItemEditor,
    OptionEditor,
    ParagraphEditor,
    QuoteEditor,
    SelectEditor,
    SnippetEditor,
    SpanEditor,
} from "cms-control/core/editorSystemV2/builtInEditors";
import { createControlEditorCatalog } from "cms-control/core/editorSystemV2/editorCatalog";

function target(tagName = "div"): HTMLElement {
    return document.createElement(tagName);
}

describe("editor built-in editors", () => {
    test("exposes content editor identities", () => {
        expect(new ParagraphEditor(target("p")).getTextCapability()?.format).toBe("richtext");
        expect(new HeadingEditor(target("h1")).getTextCapability()?.format).toBe("richtext");
        expect(new SpanEditor(target("span")).getTextCapability()?.format).toBe("richtext");
        expect(new LinkEditor(target("a")).getTextCapability()?.format).toBe("richtext");
        expect(new CodeEditor(target("code")).getTextCapability()?.format).toBe("text");
        expect(new QuoteEditor(target("blockquote")).getTextCapability()?.format).toBe("richtext");
        expect(new ImageEditor(target("img")).getSettings()[0]?.label).toBe("Image");
        expect(new InputEditor(target("input")).getSettings()[0]?.label).toBe("Text input");
        expect(new SelectEditor(target("select")).getSettings()[0]?.label).toBe("Select");
        expect(new OptionEditor(target("option")).getSettings()[0]?.label).toBe("Option");
        expect(new ListEditor(target("ul")).getSettings()).toEqual([]);
        expect(new ListItemEditor(target("li")).getSettings()).toEqual([]);
    });

    test("exposes default content slots", () => {
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
        expect(new SpanEditor(target("span")).getContentSlots()).toEqual([]);
        expect(new LinkEditor(target("a")).getContentSlots()).toEqual([]);
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
        expect(new LinkEditor(target("a")).getTextCapability()).toEqual({
            format: "richtext",
            bold: true,
            italic: true,
            underline: true,
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

    test("link editor exposes target settings", () => {
        expect(new LinkEditor(target("a")).getSettings()).toEqual([
            {
                kind: "self",
                label: "Link",
                settings: [
                    {
                        type: "page-link",
                        label: "Target",
                        attribute: "href",
                    },
                    {
                        type: "select",
                        label: "Open in",
                        attribute: "target",
                        defaultValue: "_self",
                        options: [
                            { label: "Same tab", value: "_self" },
                            { label: "New tab", value: "_blank" },
                        ],
                    },
                    {
                        type: "text",
                        label: "Relationship",
                        attribute: "rel",
                    },
                ],
            },
        ]);
    });

    test("input editor exposes type and field attribute settings", () => {
        const inputSettings = new InputEditor(target("input")).getSettings()[0];

        expect(inputSettings?.settings.map(setting => setting.attribute)).toEqual([
            "type",
            "name",
            "placeholder",
            "value",
            "required",
            "disabled",
        ]);
        expect(inputSettings?.settings[0]).toMatchObject({
            type: "select",
            label: "Type",
            attribute: "type",
        });
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
            "a",
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
