import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import type {
    EditorCatalog,
    EditorCatalogEntry,
} from "@bernouy/cms-content/editor";
import { Editor } from "@bernouy/cms-content/editor";
import type { BlockPickerSelectDetail } from "../src/components/Layout/BlockPickerModal/BlockPickerModal";
import type { TopBarViewportChangeDetail } from "../src/components/Layout/TopBar/TopBar";
import type { EditorStructureNode } from "../src/runtime";

function installDom(): void {
    const { document, customElements, Element, HTMLElement, CustomEvent, Event, Node } = parseHTML(`
        <!DOCTYPE html>
        <html>
            <body></body>
        </html>
    `);

    Object.assign(globalThis, {
        document,
        customElements,
        Element,
        HTMLElement,
        CustomEvent,
        Event,
        Node,
        requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(callback, 0),
    });
}

describe("Shell", () => {
    test("block picker filters blocks by category and inserts from details", async () => {
        installDom();

        const {
            BLOCK_PICKER_SELECT_EVENT,
            BlockPickerModal,
        } = await import("../src/components/Layout/BlockPickerModal/BlockPickerModal");

        class DemoEditor {
            constructor(readonly target: HTMLElement) { }
        }

        const card: EditorCatalogEntry = {
            tag:         "p9r-card",
            label:       "Card",
            description: "Groups content.",
            category:    "Layout",
            subCategory: "Content",
            bloc:        HTMLElement as unknown as CustomElementConstructor,
            editor:      DemoEditor as unknown as new (target: HTMLElement) => Editor,
        };
        const paragraph: EditorCatalogEntry = {
            tag:         "p",
            label:       "Paragraph",
            description: "Rich text.",
            category:    "Text",
            bloc:        HTMLElement as unknown as CustomElementConstructor,
            editor:      DemoEditor as unknown as new (target: HTMLElement) => Editor,
        };
        const picker = new BlockPickerModal();
        const selected: string[] = [];
        picker.addEventListener(BLOCK_PICKER_SELECT_EVENT, (event) => {
            selected.push((event as CustomEvent<BlockPickerSelectDetail>).detail.option.item?.kind ?? "");
        });
        document.body.append(picker);

        picker.open([{
            label: "Content",
            options: [
                { entry: card, slotLabel: "Content" },
                { entry: paragraph, slotLabel: "Content" },
            ],
        }], "Container");

        const categoryButton = Array.from(picker.shadowRoot!.querySelectorAll<HTMLButtonElement>(".categories .filter"))
            .find(button => button.textContent?.includes("Text"));
        categoryButton?.click();
        picker.shadowRoot!.querySelector<HTMLButtonElement>(".insert")!.click();

        expect(picker.shadowRoot!.querySelector("h3")?.textContent).toBe("Paragraph");
        expect(selected).toEqual(["block"]);
    });

    test("block picker supports template source items", async () => {
        installDom();

        const {
            BLOCK_PICKER_SELECT_EVENT,
            BlockPickerModal,
        } = await import("../src/components/Layout/BlockPickerModal/BlockPickerModal");

        const picker = new BlockPickerModal();
        let selectedContent = "";
        picker.addEventListener(BLOCK_PICKER_SELECT_EVENT, (event) => {
            const item = (event as CustomEvent<BlockPickerSelectDetail>).detail.option.item;
            selectedContent = item?.kind === "template" ? item.content : "";
        });
        document.body.append(picker);

        picker.open([{
            label: "Content",
            options: [{
                item: {
                    kind:        "template",
                    id:          "tpl-1",
                    label:       "Hero template",
                    description: "Reusable hero.",
                    category:    "Marketing",
                    content:     "<section></section>",
                },
                slotLabel: "Content",
            }],
        }], "Container");

        picker.shadowRoot!.querySelector<HTMLButtonElement>(".sources .filter:nth-child(2)")!.click();
        picker.shadowRoot!.querySelector<HTMLButtonElement>(".insert")!.click();

        expect(picker.shadowRoot!.querySelector("h3")?.textContent).toBe("Hero template");
        expect(selectedContent).toBe("<section></section>");
    });

    test("block picker selects media source directly", async () => {
        installDom();

        const {
            BLOCK_PICKER_SELECT_EVENT,
            BlockPickerModal,
        } = await import("../src/components/Layout/BlockPickerModal/BlockPickerModal");

        class DemoEditor {
            constructor(readonly target: HTMLElement) { }
        }

        const card: EditorCatalogEntry = {
            tag:         "p9r-card",
            label:       "Card",
            description: "Groups content.",
            category:    "Layout",
            bloc:        HTMLElement as unknown as CustomElementConstructor,
            editor:      DemoEditor as unknown as new (target: HTMLElement) => Editor,
        };
        const picker = new BlockPickerModal();
        const selected: string[] = [];
        picker.addEventListener(BLOCK_PICKER_SELECT_EVENT, (event) => {
            selected.push((event as CustomEvent<BlockPickerSelectDetail>).detail.option.item?.kind ?? "");
        });
        document.body.append(picker);

        picker.open([{
            label: "Image",
            options: [
                { entry: card, slotLabel: "Image" },
                {
                    item: {
                        kind:        "media",
                        label:       "Media",
                        description: "Choose a file from the CMS library.",
                        category:    "Media",
                        accept:      ["image"],
                    },
                    slotLabel: "Image",
                },
            ],
        }], "Media feature");

        picker.shadowRoot!.querySelector<HTMLButtonElement>(".sources .filter:nth-child(4)")!.click();

        expect(selected).toEqual(["media"]);
    });

    test("block picker hides template items that exceed slot max", async () => {
        installDom();

        const { StructureTree } = await import("../src/components/Layout/StructureTree/StructureTree");

        class CardEditor extends Editor {
            protected override contentSlots() {
                return [{
                    label:   "Header",
                    slot:    "header",
                    max:     1,
                    accepts: [{ kind: "any-component" as const }],
                }];
            }
        }

        const target = document.createElement("demo-card");
        const editor = new CardEditor(target);
        const node: EditorStructureNode = {
            editor,
            target,
            tag:      "demo-card",
            label:    "Card",
            badges:   [],
            children: [],
        };
        const tree = new StructureTree();
        document.body.append(tree);
        tree.setInsertItems([
            {
                kind:    "template",
                id:      "multi-root",
                label:   "Multi root",
                content: "<p>One</p><p>Two</p>",
            },
            {
                kind:    "template",
                id:      "single-root",
                label:   "Single root",
                content: "<p>One</p>",
            },
        ]);
        tree.setStructure([node], null);

        const groups = (tree as unknown as {
            _childGroups(node: EditorStructureNode): Array<{ options: Array<{ item?: { id?: string } }> }>;
        })._childGroups(node);
        const optionIds = groups.flatMap(group => group.options.map(option => option.item?.id));

        expect(optionIds).toContain("single-root");
        expect(optionIds).not.toContain("multi-root");
    });

    test("topbar emits full and bleed viewport changes", async () => {
        installDom();

        const {
            TOPBAR_VIEWPORT_CHANGE_EVENT,
            TopBar,
        } = await import("../src/components/Layout/TopBar/TopBar");

        const topbar = new TopBar();
        document.body.append(topbar);

        const events: TopBarViewportChangeDetail[] = [];
        topbar.addEventListener(TOPBAR_VIEWPORT_CHANGE_EVENT, (event) => {
            events.push((event as CustomEvent<TopBarViewportChangeDetail>).detail);
        });

        topbar.shadowRoot!.querySelector<HTMLButtonElement>('[data-viewport="full"]')!.click();
        topbar.shadowRoot!.querySelector<HTMLButtonElement>('[data-viewport="bleed"]')!.click();

        expect(events).toEqual([
            { viewport: "full" },
            { viewport: "bleed" },
        ]);
    });

    test("receives the editor catalog", async () => {
        installDom();

        const { Shell } = await import("../src/exports");

        class DemoBloc extends HTMLElement { }
        class DemoEditor {
            constructor(readonly target: HTMLElement) { }
        }

        const catalog: EditorCatalog = [
            {
                tag: "demo-bloc",
                label: "Demo bloc",
                bloc: DemoBloc,
                editor: DemoEditor as unknown as new (target: HTMLElement) => Editor,
            },
        ];
        const shell = new Shell();

        shell.setCatalog(catalog);

        expect(shell.catalog).toEqual(catalog);
        expect(shell.getAttribute("catalog-size")).toBe("1");
    });

    test("serializes expanded snippets as snippet references", async () => {
        installDom();

        const { Shell } = await import("../src/exports");
        const shell = new Shell();
        document.body.append(shell);

        const contentRoot = document.createElement("div");
        contentRoot.setAttribute("data-cms-content", "");
        contentRoot.innerHTML = `<w13c-snippet identifier="main-nav"><nav>Expanded</nav></w13c-snippet>`;
        const frameDocument = {
            querySelector: (selector: string) => selector === "[data-cms-content]" ? contentRoot : null,
        };

        (shell as unknown as { _frameDocument: typeof frameDocument })._frameDocument = frameDocument;

        expect((shell as unknown as { _getContentHtml(): string })._getContentHtml())
            .toBe(`<w13c-snippet identifier="main-nav"></w13c-snippet>`);
    });

    test("inserts template fragments into selected content slots", async () => {
        installDom();

        const { Shell } = await import("../src/exports");

        class ContainerEditor extends Editor {
            protected override contentSlots() {
                return [{
                    label:   "Content",
                    accepts: [{ kind: "any-component" as const }],
                }];
            }
        }

        class ParagraphEditor extends Editor { }

        const { document: frameDocument } = parseHTML(`
            <!DOCTYPE html>
            <html>
                <body></body>
            </html>
        `);
        const root = frameDocument.createElement("div");
        const contentRoot = frameDocument.createElement("div");
        contentRoot.setAttribute("data-cms-content", "");
        const container = frameDocument.createElement("demo-container");
        contentRoot.append(container);
        root.append(contentRoot);
        frameDocument.body.append(root);

        const shell = new Shell();
        document.body.append(shell);
        const structureTree = shell.shadowRoot!.querySelector("cms-editor-v2-structure-tree") as Element & {
            catalog?: unknown[];
            setInsertItems?: (_items: unknown[]) => void;
            setStructure?: () => void;
        };
        structureTree.setInsertItems = () => undefined;
        structureTree.setStructure = () => undefined;
        shell.setInsertItems([{
            kind:       "snippet",
            id:         "snippet-main-nav",
            identifier: "main-nav",
            label:      "Main nav",
            content:    "<nav>Expanded nav</nav>",
        }]);
        shell.setCatalog([
            {
                tag:    "demo-container",
                label:  "Container",
                bloc:   HTMLElement as unknown as CustomElementConstructor,
                editor: ContainerEditor,
            },
            {
                tag:    "p",
                label:  "Paragraph",
                bloc:   HTMLElement as unknown as CustomElementConstructor,
                editor: ParagraphEditor,
            },
        ]);
        (shell as unknown as { _frameDocument: Document })._frameDocument = frameDocument;
        shell.loadDocument({ root, contentRoot });

        const runtime = (shell as unknown as { _runtime: { getEditor(target: HTMLElement): Editor | undefined } })._runtime;
        const parentEditor = runtime.getEditor(container);
        if (!parentEditor) throw new Error("Missing container editor.");

        (shell as unknown as {
            _addChild(parent: Editor, item: unknown, slotName?: string): void;
        })._addChild(parentEditor, {
            kind:    "template",
            id:      "tpl-hero",
            label:   "Hero template",
            content: `<p>Inserted from template</p><w13c-snippet identifier="main-nav"></w13c-snippet>`,
        });

        expect(container.innerHTML).toBe(`<p>Inserted from template</p><w13c-snippet identifier="main-nav"><nav>Expanded nav</nav></w13c-snippet>`);
    });

    test("ignores native rich text input events without a value detail", async () => {
        installDom();

        const {
            SETTINGS_VIEW_CONTENT_CHANGE_EVENT,
            SettingsView,
        } = await import("../src/components/Settings/SettingsView/SettingsView");
        if (!customElements.get("cms-editor-v2-rich-text-editor")) {
            customElements.define("cms-editor-v2-rich-text-editor", class extends HTMLElement {});
        }

        const view = new SettingsView();
        const events: string[] = [];
        view.addEventListener(SETTINGS_VIEW_CONTENT_CHANGE_EVENT, (event) => {
            events.push((event as CustomEvent<{ value: string }>).detail.value);
        });

        view.setSettings([], {
            format: "richtext",
            bold:   true,
        }, "Initial");

        const control = view.shadowRoot!.querySelector("cms-editor-v2-rich-text-editor")!;

        control.dispatchEvent(new Event("input", {
            bubbles:  true,
            composed: true,
        }));
        control.dispatchEvent(new CustomEvent("input", {
            bubbles:  true,
            composed: true,
            detail:   { value: "Updated" },
        }));

        expect(events).toEqual(["Updated"]);
    });

    test("page link control selects internal pages and external URLs", async () => {
        installDom();
        document.head.innerHTML = `<meta name="basePath" content="/cms">`;

        const calls: string[] = [];
        globalThis.fetch = (async (url: string | URL | Request) => {
            calls.push(String(url));
            return new Response(JSON.stringify([
                { title: "Pricing", path: "/pricing" },
                { title: "About", path: "/about" },
            ]), {
                headers: { "Content-Type": "application/json" },
            });
        }) as typeof fetch;

        const { PageLink } = await import("../src/components/Controls/PageLink/PageLink");
        const control = new PageLink();
        const values: string[] = [];
        control.addEventListener("input", (event) => {
            values.push((event as CustomEvent<{ value: string }>).detail.value);
        });
        document.body.append(control);
        control.connectedCallback();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(calls).toEqual(["/cms/api/page/links"]);

        const search = control.shadowRoot!.querySelector<HTMLInputElement>(".search")!;
        search.value = "pricing";
        search.dispatchEvent(new Event("input", { bubbles: true }));

        control.shadowRoot!.querySelector<HTMLButtonElement>(".page-option")!.click();
        expect(values.at(-1)).toBe("/pricing");
        expect(control.getAttribute("value")).toBe("/pricing");

        control.shadowRoot!.querySelectorAll<HTMLButtonElement>(".tabs button")[1]!.click();
        const external = control.shadowRoot!.querySelector<HTMLInputElement>(".external-input")!;
        external.value = "https://example.com";
        external.dispatchEvent(new Event("input", { bubbles: true }));

        expect(values.at(-1)).toBe("https://example.com");
        expect(control.getAttribute("value")).toBe("https://example.com");
    });

    test("files center selects files by opaque id url", async () => {
        installDom();
        document.head.innerHTML = `<meta name="basePath" content="/cms">`;

        const calls: string[] = [];
        globalThis.fetch = (async (url: string | URL | Request) => {
            calls.push(String(url));
            return new Response(JSON.stringify({
                items: [
                    { id: "folder-1", name: "Documents", parentId: null, type: "folder" },
                    {
                        id:          "file 1",
                        name:        "Guide.pdf",
                        parentId:    null,
                        type:        "file",
                        size:        1200,
                        mimeType:    "application/pdf",
                        contentHash: "hash",
                    },
                ],
            }), {
                headers: { "Content-Type": "application/json" },
            });
        }) as typeof fetch;

        const { FilesCenter } = await import("../src/components/Controls/FilesCenter/FilesCenter");
        const center = new FilesCenter();
        const selected: string[] = [];
        center.addEventListener("select-file", (event) => {
            selected.push((event as CustomEvent<{ src: string }>).detail.src);
        });
        document.body.append(center);
        center.connectedCallback();
        center.show();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(calls.at(0)).toBe("/cms/api/files?accept=folder%2Cfile&sortBy=name&limit=10000");

        const file = Array.from(center.shadowRoot!.querySelectorAll<HTMLButtonElement>(".item"))
            .find(button => button.textContent?.includes("Guide.pdf"))!;
        file.click();
        center.shadowRoot!.querySelector<HTMLButtonElement>(".select")!.click();

        expect(selected).toEqual(["/cms/.cms/files/by-id/file%201"]);
    });

    test("page link media mode opens the files center", async () => {
        installDom();
        document.head.innerHTML = `<meta name="basePath" content="/cms">`;

        globalThis.fetch = (async (url: string | URL | Request) => {
            const href = String(url);
            if (href.includes("/api/page/links")) {
                return new Response(JSON.stringify([]), {
                    headers: { "Content-Type": "application/json" },
                });
            }
            return new Response(JSON.stringify({
                items: [{
                    id:       "hero",
                    name:     "Hero.png",
                    parentId: null,
                    type:     "file",
                    mimeType: "image/png",
                }],
            }), {
                headers: { "Content-Type": "application/json" },
            });
        }) as typeof fetch;

        const { PageLink } = await import("../src/components/Controls/PageLink/PageLink");
        const control = new PageLink();
        control.setAttribute("allow-media", "true");
        const values: string[] = [];
        control.addEventListener("input", (event) => {
            values.push((event as CustomEvent<{ value: string }>).detail.value);
        });
        document.body.append(control);
        control.connectedCallback();
        await new Promise(resolve => setTimeout(resolve, 0));

        const mediaTab = Array.from(control.shadowRoot!.querySelectorAll<HTMLButtonElement>(".tabs button"))
            .find(button => button.textContent === "Media")!;
        mediaTab.click();
        control.shadowRoot!.querySelector<HTMLButtonElement>(".file-button")!.click();
        await new Promise(resolve => setTimeout(resolve, 0));

        const center = document.body.querySelector("cms-editor-v2-files-center")!;
        center.shadowRoot!.querySelector<HTMLButtonElement>(".item")!.click();
        center.shadowRoot!.querySelector<HTMLButtonElement>(".select")!.click();

        expect(values).toEqual(["/cms/.cms/files/by-id/hero"]);
        expect(control.getAttribute("value")).toBe("/cms/.cms/files/by-id/hero");
    });

    test("shell inserts media into content slots as native image elements", async () => {
        installDom();
        document.head.innerHTML = `<meta name="basePath" content="/cms">`;

        globalThis.fetch = (async () => new Response(JSON.stringify({
            items: [
                {
                    id:       "photo",
                    name:     "Photo.png",
                    parentId: null,
                    type:     "file",
                    mimeType: "image/png",
                },
                {
                    id:       "logo",
                    name:     "Logo.svg",
                    parentId: null,
                    type:     "file",
                    mimeType: "image/svg+xml",
                },
            ],
        }), {
            headers: { "Content-Type": "application/json" },
        })) as typeof fetch;

        const { Shell } = await import("../src/exports");

        class FigureEditor extends Editor {
            protected override contentSlots() {
                return [{
                    label: "Cover",
                    slot: "cover",
                    max: 1,
                    accepts: [{ kind: "media" as const, accept: ["svg" as const] }],
                }];
            }
        }

        const { document: frameDocument } = parseHTML(`
            <!DOCTYPE html>
            <html>
                <body></body>
            </html>
        `);
        const root = frameDocument.createElement("div");
        const contentRoot = frameDocument.createElement("div");
        contentRoot.setAttribute("data-cms-content", "");
        const figure = frameDocument.createElement("demo-figure");
        contentRoot.append(figure);
        root.append(contentRoot);
        frameDocument.body.append(root);

        const shell = new Shell();
        document.body.append(shell);
        const structureTree = shell.shadowRoot!.querySelector("cms-editor-v2-structure-tree") as Element & {
            setInsertItems?: (_items: unknown[]) => void;
            setStructure?: () => void;
        };
        structureTree.setInsertItems = () => undefined;
        structureTree.setStructure = () => undefined;
        shell.setCatalog([{
            tag: "demo-figure",
            label: "Figure",
            bloc: HTMLElement as unknown as CustomElementConstructor,
            editor: FigureEditor,
        }]);
        (shell as unknown as { _frameDocument: Document })._frameDocument = frameDocument;
        shell.loadDocument({ root, contentRoot });

        const runtime = (shell as unknown as { _runtime: { getEditor(target: HTMLElement): Editor | undefined } })._runtime;
        const figureEditor = runtime.getEditor(figure);
        if (!figureEditor) throw new Error("Missing figure editor.");

        (shell as unknown as {
            _addChild(parent: Editor, item: unknown, slotName?: string): void;
        })._addChild(figureEditor, {
            kind: "media",
            label: "Media",
            accept: ["svg"],
        }, "cover");
        await new Promise(resolve => setTimeout(resolve, 0));

        const center = document.body.querySelector("cms-editor-v2-files-center")!;
        const items = Array.from(center.shadowRoot!.querySelectorAll<HTMLButtonElement>(".item"));
        expect(items.map(item => item.textContent)).toEqual(["Logo.svgimage/svg+xml"]);

        items[0]!.click();
        center.shadowRoot!.querySelector<HTMLButtonElement>(".select")!.click();

        const image = figure.querySelector("img")!;
        expect(image.getAttribute("slot")).toBe("cover");
        expect(image.getAttribute("src")).toBe("/cms/.cms/files/by-id/logo");
        expect(image.getAttribute("alt")).toBe("Logo.svg");

        Object.defineProperty(image, "naturalWidth", { value: 320, configurable: true });
        Object.defineProperty(image, "naturalHeight", { value: 180, configurable: true });
        image.dispatchEvent(new Event("load"));

        expect(image.getAttribute("width")).toBe("320");
        expect(image.getAttribute("height")).toBe("180");
    });

    test("settings view emits page-link setting changes", async () => {
        installDom();
        document.head.innerHTML = `<meta name="basePath" content="/cms">`;

        globalThis.fetch = (async () => new Response(JSON.stringify([
            { title: "Contact", path: "/contact" },
        ]), {
            headers: { "Content-Type": "application/json" },
        })) as typeof fetch;

        const {
            SETTINGS_VIEW_SETTING_CHANGE_EVENT,
            SettingsView,
        } = await import("../src/components/Settings/SettingsView/SettingsView");
        const { PageLink } = await import("../src/components/Controls/PageLink/PageLink");
        if (!customElements.get("cms-editor-v2-page-link")) {
            customElements.define("cms-editor-v2-page-link", class extends PageLink {});
        }

        const view = new SettingsView();
        const values: string[] = [];
        view.addEventListener(SETTINGS_VIEW_SETTING_CHANGE_EVENT, (event) => {
            values.push(String((event as CustomEvent<{ value: string }>).detail.value));
        });
        document.body.append(view);

        view.setSettings([{
            kind: "self",
            label: "Link",
            settings: [{
                type: "page-link",
                label: "CTA link",
                attribute: "href",
                defaultValue: "",
                allowPage: true,
                allowExternal: true,
            }],
        }]);
        await new Promise(resolve => setTimeout(resolve, 0));

        view.shadowRoot!
            .querySelector("cms-editor-v2-page-link")!
            .shadowRoot!
            .querySelector<HTMLButtonElement>(".page-option")!
            .click();

        expect(values).toEqual(["/contact"]);
    });

    test("renders disabled settings as disabled controls", async () => {
        installDom();

        const {
            SETTINGS_VIEW_SETTING_CHANGE_EVENT,
            SettingsView,
        } = await import("../src/components/Settings/SettingsView/SettingsView");
        if (!customElements.get("cms-editor-v2-text-input")) {
            customElements.define("cms-editor-v2-text-input", class extends HTMLElement {
                constructor() {
                    super();
                    this.attachShadow({ mode: "open" }).innerHTML = "<input>";
                }
            });
        }

        const view = new SettingsView();
        let emitted = false;
        view.addEventListener(SETTINGS_VIEW_SETTING_CHANGE_EVENT, () => {
            emitted = true;
        });

        view.setSettings([
            {
                kind: "self",
                label: "Snippet",
                settings: [
                    {
                        type: "text",
                        label: "Identifier",
                        attribute: "identifier",
                        defaultValue: "main-nav",
                        disabled: true,
                    },
                ],
            },
        ]);

        const control = view.shadowRoot!.querySelector("cms-editor-v2-text-input")!;
        const input = control.shadowRoot!.querySelector<HTMLInputElement>("input")!;

        expect(control.hasAttribute("disabled")).toBe(true);
        expect(input.disabled).toBe(true);

        input.value = "changed";
        input.dispatchEvent(new Event("input", {
            bubbles: true,
        }));

        expect(emitted).toBe(false);
    });

    test("renders disabled segmented settings as disabled buttons", async () => {
        installDom();

        const {
            SETTINGS_VIEW_SETTING_CHANGE_EVENT,
            SettingsView,
        } = await import("../src/components/Settings/SettingsView/SettingsView");

        const view = new SettingsView();
        let emitted = false;
        view.addEventListener(SETTINGS_VIEW_SETTING_CHANGE_EVENT, () => {
            emitted = true;
        });

        view.setSettings([
            {
                kind: "self",
                label: "Style",
                settings: [
                    {
                        type: "segmented",
                        label: "Mode",
                        attribute: "mode",
                        defaultValue: "a",
                        disabled: true,
                        options: [
                            { label: "A", value: "a" },
                            { label: "B", value: "b" },
                        ],
                    },
                ],
            },
        ]);

        const buttons = Array.from(view.shadowRoot!.querySelectorAll<HTMLButtonElement>("cms-editor-v2-segmented-control button"));

        expect(buttons.map(button => button.disabled)).toEqual([true, true]);
        buttons[1]?.click();
        expect(emitted).toBe(false);
    });

    test("canvas emits a background click outside the page frame", async () => {
        installDom();

        const {
            CANVAS_BACKGROUND_CLICK_EVENT,
            Canvas,
        } = await import("../src/components/Layout/Canvas/Canvas");

        const canvas = new Canvas();
        const events: Event[] = [];
        canvas.addEventListener(CANVAS_BACKGROUND_CLICK_EVENT, event => events.push(event));
        document.body.append(canvas);
        canvas.connectedCallback();

        canvas.shadowRoot!.querySelector(".canvas")!.dispatchEvent(new Event("click", {
            bubbles:  true,
            composed: true,
        }));
        canvas.shadowRoot!.querySelector(".page")!.dispatchEvent(new Event("click", {
            bubbles:  true,
            composed: true,
        }));

        expect(events).toHaveLength(1);
    });

    test("structure tree only scrolls selected rows when requested", async () => {
        installDom();

        const { StructureTree } = await import("../src/components/Layout/StructureTree/StructureTree");

        class DemoEditor {
            constructor(readonly target: HTMLElement) {}
            getContentSlots() {
                return [];
            }
        }

        const target = document.createElement("demo-bloc");
        const editor = new DemoEditor(target) as unknown as Editor;
        const node: EditorStructureNode = {
            editor,
            target,
            tag:      "demo-bloc",
            label:    "Demo",
            badges:   [],
            children: [],
        };
        const tree = new StructureTree();
        document.body.append(tree);
        tree.connectedCallback();

        tree.scrollTop = 120;
        tree.setStructure([node], editor);
        expect(tree.scrollTop).toBe(120);

        let didScroll = false;
        tree.scrollTo = () => {
            didScroll = true;
        };
        tree.setStructure([node], editor, [], { scrollSelectedIntoView: true });
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(didScroll).toBe(true);
    });
});
