import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import type {
    EditorCatalog,
    EditorCatalogEntry,
} from "@bernouy/cms-content/editor";
import { Editor } from "@bernouy/cms-content/editor";
import type { BlockPickerSelectDetail } from "../src/components/Layout/BlockPickerModal/BlockPickerModal";
import type { StructureTreeActionDetail } from "../src/components/Layout/StructureTree/StructureTree";
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

    test("structure tree opens media-only slots directly without block picker", async () => {
        installDom();

        const { StructureTree } = await import("../src/components/Layout/StructureTree/StructureTree");

        class AlbumEditor extends Editor {
            protected override contentSlots() {
                return [{
                    label: "Images",
                    slot: "images",
                    accepts: [{ kind: "media" as const, accept: ["image" as const] }],
                }];
            }
        }

        const target = document.createElement("p9r-photo-album");
        const editor = new AlbumEditor(target);
        const node: EditorStructureNode = {
            editor,
            target,
            tag: "p9r-photo-album",
            label: "Photo album",
            badges: [],
            children: [],
        };
        const tree = new StructureTree();
        const actions: StructureTreeActionDetail[] = [];
        tree.addEventListener("editor-v2:structure-action", (event) => {
            actions.push((event as CustomEvent<StructureTreeActionDetail>).detail);
        });
        document.body.append(tree);
        tree.setStructure([node], null);

        const internals = tree as unknown as {
            _childGroups(node: EditorStructureNode): Array<{ label: string; options: Array<unknown> }>;
            _openPickerOrEmitSingleMedia(
                action: { action: "add-child"; editor: Editor },
                groups: Array<{ label: string; options: Array<unknown> }>,
                contextLabel: string,
            ): void;
        };
        internals._openPickerOrEmitSingleMedia(
            { action: "add-child", editor },
            internals._childGroups(node),
            node.label,
        );

        expect(actions).toHaveLength(1);
        expect(actions[0]?.action).toBe("add-child");
        expect(actions[0]?.editor).toBe(editor);
        expect(actions[0]?.slot).toBe("images");
        expect(actions[0]?.item?.kind).toBe("media");
        expect(actions[0]?.item?.kind === "media" ? actions[0].item.accept : undefined).toEqual(["image"]);
        expect(tree.shadowRoot!.querySelector("cms-editor-v2-block-picker-modal")).toBeNull();
    });

    test("replace picker allows replacing the only child in a max-one slot", async () => {
        installDom();

        const { StructureTree } = await import("../src/components/Layout/StructureTree/StructureTree");

        class ContainerEditor extends Editor {
            protected override contentSlots() {
                return [{
                    label: "Content",
                    max: 1,
                    accepts: [{ kind: "any-component" as const }],
                }];
            }
        }

        class ChildEditor extends Editor {}

        const parentTarget = document.createElement("demo-container");
        const childTarget = document.createElement("demo-child");
        const parentEditor = new ContainerEditor(parentTarget);
        const childEditor = new ChildEditor(childTarget);
        const childNode: EditorStructureNode = {
            editor: childEditor,
            target: childTarget,
            tag: "demo-child",
            label: "Child",
            badges: [],
            children: [],
        };
        const parentNode: EditorStructureNode = {
            editor: parentEditor,
            target: parentTarget,
            tag: "demo-container",
            label: "Container",
            badges: [],
            children: [childNode],
        };
        const tree = new StructureTree();
        document.body.append(tree);
        tree.setInsertItems([{
            kind: "template",
            id: "replacement",
            label: "Replacement",
            content: "<demo-child>Replacement</demo-child>",
        }]);
        tree.setStructure([parentNode], null);

        const groups = (tree as unknown as {
            _replaceGroups(node: EditorStructureNode): Array<{ disabledReason?: string; options: Array<{ item?: { id?: string } }> }>;
        })._replaceGroups(childNode);

        expect(groups[0]!.disabledReason).toBeUndefined();
        expect(groups[0]!.options.map(option => option.item?.id)).toContain("replacement");
    });

    test("structure tree ignores delete shortcuts from shadow editable controls", async () => {
        installDom();

        const { StructureTree } = await import("../src/components/Layout/StructureTree/StructureTree");

        class CardEditor extends Editor { }

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
        const host = document.createElement("cms-editor-shell");
        const shadow = host.attachShadow({ mode: "open" });
        const input = document.createElement("input");
        shadow.append(input);
        document.body.append(host, tree);
        tree.setStructure([node], editor);

        const actions: string[] = [];
        tree.addEventListener("editor-v2:structure-action", (event) => {
            actions.push((event as CustomEvent<StructureTreeActionDetail>).detail.action);
        });

        let prevented = false;
        (tree as unknown as {
            _onDocumentKeydown(event: KeyboardEvent): void;
        })._onDocumentKeydown({
            key:          "Delete",
            ctrlKey:      false,
            metaKey:      false,
            target:       host,
            preventDefault: () => {
                prevented = true;
            },
            composedPath: () => [input, shadow, host, document],
        } as unknown as KeyboardEvent);

        expect(actions).toEqual([]);
        expect(prevented).toBe(false);
    });

    test("structure tree emits source selection actions from the source picker", async () => {
        installDom();

        const { StructureTree } = await import("../src/components/Layout/StructureTree/StructureTree");

        class CardEditor extends Editor { }

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
        tree.setDataSources([{
            label: "Plans",
            url: "/api/plans",
            method: "GET",
            provider: "ban",
            providerLabel: "Base Adresse Nationale",
            description: "Available pricing plans.",
            params: [
                { name: "q", in: "query", required: true, type: "string", description: "Search query." },
                { name: "limit", in: "query", type: "number" },
            ],
            fields: [{ path: "items", type: "array" }],
        }, {
            label: "Create plan",
            url: "/api/plans",
            method: "POST",
            provider: "ban",
            providerLabel: "Base Adresse Nationale",
            fields: [],
        }]);
        tree.setStructure([node], editor);

        let detail: StructureTreeActionDetail | undefined;
        tree.addEventListener("editor-v2:structure-action", (event) => {
            detail = (event as CustomEvent<StructureTreeActionDetail>).detail;
        });

        (tree as unknown as {
            _openSourcePicker(node: EditorStructureNode): void;
        })._openSourcePicker(node);

        const picker = tree.shadowRoot!.querySelector("cms-editor-v2-data-source-picker")!;
        expect(picker.shadowRoot!.querySelector(".source .name")?.textContent).toBe("Plans");
        expect(picker.shadowRoot!.querySelector(".details-eyebrow")?.textContent).toBe("Response fields");
        expect(picker.shadowRoot!.querySelector(".binding .config-heading")?.textContent).toBe("Binding");
        expect(picker.shadowRoot!.textContent ?? "").not.toContain("Create plan");
        picker.shadowRoot!.querySelector<HTMLInputElement>(".source-alias")!.value = "plans";
        const rows = picker.shadowRoot!.querySelectorAll<HTMLElement>(".param-row");
        rows[0]!.querySelector<HTMLInputElement>(".param-value")!.value = "address";
        rows[1]!.querySelector<HTMLSelectElement>(".param-mode")!.setAttribute("value", "raw");
        rows[1]!.querySelector<HTMLInputElement>(".param-value")!.value = "5";
        picker.shadowRoot!.querySelector<HTMLButtonElement>(".insert")!.click();

        expect(detail?.action).toBe("set-source");
        expect(detail?.editor).toBe(editor);
        expect(detail?.dataSource?.url).toBe("/api/plans");
        expect(detail?.sourceBinding).toEqual({
            url: "/api/plans",
            alias: "plans",
            params: {
                q: { from: "queryParam", name: "address" },
                limit: { from: "raw", value: "5" },
            },
        });
    });

    test("structure tree removes source from the source picker", async () => {
        installDom();

        const { StructureTree } = await import("../src/components/Layout/StructureTree/StructureTree");

        class CardEditor extends Editor { }

        const target = document.createElement("demo-card");
        target.setAttribute("cms-source", "/api/plans");
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
        tree.setDataSources([{
            label: "Plans",
            url: "/api/plans",
            method: "GET",
            fields: [{ path: "items", type: "array" }],
        }]);
        tree.setStructure([node], editor);

        let detail: StructureTreeActionDetail | undefined;
        tree.addEventListener("editor-v2:structure-action", (event) => {
            detail = (event as CustomEvent<StructureTreeActionDetail>).detail;
        });

        expect((tree as unknown as {
            _sourceActionLabel(node: EditorStructureNode): string;
        })._sourceActionLabel(node)).toBe("Update source");

        (tree as unknown as {
            _openSourcePicker(node: EditorStructureNode): void;
        })._openSourcePicker(node);

        const picker = tree.shadowRoot!.querySelector("cms-editor-v2-data-source-picker")!;
        picker.shadowRoot!.querySelector<HTMLButtonElement>(".remove-source")!.click();

        expect(detail?.action).toBe("remove-source");
        expect(detail?.editor).toBe(editor);
    });

    test("structure tree uses the default template on empty pages", async () => {
        installDom();

        const { StructureTree } = await import("../src/components/Layout/StructureTree/StructureTree");

        const tree = new StructureTree();
        document.body.append(tree);
        tree.setInsertItems([{
            kind:        "template",
            id:          "tpl-default",
            label:       "Default layout",
            category:    "Layouts",
            description: "Default page layout.",
            content:     "<main></main>",
        }, {
            kind:        "template",
            id:          "tpl-other",
            label:       "Other layout",
            category:    "Other",
            content:     "<section></section>",
        }]);
        tree.setDefaultTemplateSelection({ category: "Layouts" });
        tree.setStructure([], null);

        let detail: StructureTreeActionDetail | undefined;
        tree.addEventListener("editor-v2:structure-action", (event) => {
            detail = (event as CustomEvent<StructureTreeActionDetail>).detail;
        });

        const button = tree.shadowRoot!.querySelector<HTMLButtonElement>(".empty button")!;
        expect(button.textContent).toBe("Use default template");
        button.click();

        expect(detail?.action).toBe("add-root");
        expect(detail?.item?.kind).toBe("template");
        expect(detail?.item?.id).toBe("tpl-default");
    });

    test("repeat picker emits selected array and alias", async () => {
        installDom();

        const {
            REPEAT_PICKER_SELECT_EVENT,
            RepeatPicker,
        } = await import("../src/components/Layout/RepeatPicker/RepeatPicker");

        const picker = new RepeatPicker();
        document.body.append(picker);

        let detail: { path: string; alias: string } | undefined;
        picker.addEventListener(REPEAT_PICKER_SELECT_EVENT, (event) => {
            detail = (event as CustomEvent<{ path: string; alias: string }>).detail;
        });

        picker.open([{
            name: "data",
            label: "Plans",
            fields: [{
                path: "features",
                type: "array",
                children: [
                    { path: "name", type: "string" },
                    {
                        path: "geometry",
                        type: "object",
                        children: [{
                            path: "coordinates",
                            type: "array",
                            children: [{ path: ".", type: "number" }],
                        }],
                    },
                ],
            }],
        }, {
            name: "data",
            label: "Plans",
            fields: [{
                path: "features",
                type: "array",
                children: [{ path: "name", type: "string" }],
            }],
        }]);
        expect(picker.shadowRoot!.querySelectorAll(".array")).toHaveLength(1);
        const fieldPaths = Array.from(picker.shadowRoot!.querySelectorAll(".field-path"))
            .map(item => item.textContent);
        expect(fieldPaths).toContain("geometry");
        expect(fieldPaths).toContain("coordinates");
        picker.shadowRoot!.querySelector<HTMLInputElement>(".alias")!.value = "plan";
        picker.shadowRoot!.querySelector<HTMLButtonElement>(".insert")!.click();

        expect(detail).toEqual({
            path: "data.features",
            alias: "plan",
        });
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

    test("topbar defaults to bleed viewport", async () => {
        installDom();

        const { TopBar } = await import("../src/components/Layout/TopBar/TopBar");

        const topbar = new TopBar();
        document.body.append(topbar);

        expect(topbar.viewport).toBe("bleed");
        expect(topbar.shadowRoot!.querySelector<HTMLButtonElement>('[data-viewport="bleed"]')?.classList.contains("active")).toBe(true);
        expect(topbar.shadowRoot!.querySelector<HTMLButtonElement>('[data-viewport="bleed"]')?.getAttribute("aria-pressed")).toBe("true");
        expect(topbar.shadowRoot!.querySelector<HTMLButtonElement>('[data-viewport="desktop"]')?.getAttribute("aria-pressed")).toBe("false");
    });

    test("topbar renders resource navigation labels", async () => {
        installDom();

        const { TopBar } = await import("../src/components/Layout/TopBar/TopBar");

        const topbar = new TopBar();
        document.body.append(topbar);

        topbar.setNavigation({
            backHref:      "/cms/admin/snippets",
            backLabel:     "Snippets",
            settingsLabel: "Snippet settings",
        });

        const back = topbar.shadowRoot!.querySelector<HTMLAnchorElement>(".back")!;
        expect(back.getAttribute("href")).toBe("/cms/admin/snippets");
        expect(topbar.shadowRoot!.querySelector(".back-label")!.textContent).toBe("Snippets");
        expect(topbar.shadowRoot!.querySelector(".settings-label")!.textContent).toBe("Snippet settings");
    });

    test("shell applies resource chrome attributes", async () => {
        installDom();

        const { TopBar } = await import("../src/components/Layout/TopBar/TopBar");
        if (!customElements.get("cms-editor-v2-topbar")) {
            customElements.define("cms-editor-v2-topbar", class extends TopBar {});
        }

        const { Shell } = await import("../src/exports");

        const shell = new Shell();
        shell.setAttribute("resource", "snippet");
        shell.setAttribute("back-href", "/cms/admin/snippets");
        shell.setAttribute("back-label", "Snippets");
        shell.setAttribute("settings-label", "Snippet settings");
        shell.setAttribute("settings-title", "Snippet settings");
        shell.setAttribute("settings-description", "Configure snippet metadata.");
        shell.setAttribute("settings-path-label", "Identifier");
        shell.setAttribute("settings-tags-label", "Category");
        document.body.append(shell);

        const topbar = shell.shadowRoot!.querySelector("cms-editor-v2-topbar")!;
        const back = topbar.shadowRoot!.querySelector<HTMLAnchorElement>(".back")!;

        expect(back.getAttribute("href")).toBe("/cms/admin/snippets");
        expect(topbar.shadowRoot!.querySelector(".back-label")!.textContent).toBe("Snippets");
        expect(topbar.shadowRoot!.querySelector(".settings-label")!.textContent).toBe("Snippet settings");
        expect(shell.shadowRoot!.querySelector("#page-settings-title")!.textContent).toBe("Snippet settings");
        expect(shell.shadowRoot!.querySelector(".settings-description")!.textContent).toBe("Configure snippet metadata.");
        expect(shell.shadowRoot!.querySelector('[data-page-label="path"]')!.textContent).toBe("Identifier");
        expect(shell.shadowRoot!.querySelector('[data-page-label="tags"]')!.textContent).toBe("Category");
        expect(shell.shadowRoot!.querySelector('[data-page-field="path"]')!.hasAttribute("disabled")).toBe(true);
        expect(shell.shadowRoot!.querySelector('[data-page-field="published"]')!.closest("label")!.hidden).toBe(true);
    });

    test("shell treats an empty paragraph as empty page content", async () => {
        installDom();

        const { Shell } = await import("../src/exports");

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
        contentRoot.innerHTML = "<p></p>";
        root.append(contentRoot);
        frameDocument.body.append(root);

        const shell = new Shell();
        document.body.append(shell);
        shell.setCatalog([{
            tag:    "p",
            label:  "Paragraph",
            bloc:   HTMLElement as unknown as CustomElementConstructor,
            editor: ParagraphEditor,
        }]);

        let renderedStructure: EditorStructureNode[] | undefined;
        const structureTree = shell.shadowRoot!.querySelector("cms-editor-v2-structure-tree") as Element & {
            setStructure?: (nodes: EditorStructureNode[]) => void;
        };
        structureTree.setStructure = (nodes) => {
            renderedStructure = nodes;
        };

        (shell as unknown as { _frameDocument: Document })._frameDocument = frameDocument;
        shell.loadDocument({ root, contentRoot });
        expect(renderedStructure).toEqual([]);

        (shell as unknown as { _addRoot(item: unknown): void })._addRoot({
            kind:    "template",
            id:      "tpl-default",
            label:   "Default template",
            content: "<main></main>",
        });

        expect(contentRoot.innerHTML).toBe("<main></main>");
    });


    test("shell scrolls frame target into view when selected from structure", async () => {
        installDom();

        const { Shell } = await import("../src/exports");

        class ParagraphEditor extends Editor {}

        const { document: frameDocument } = parseHTML(`
            <!DOCTYPE html>
            <html>
                <body></body>
            </html>
        `);
        const root = frameDocument.createElement("div");
        root.setAttribute("data-cms-editor-root", "");
        const contentRoot = frameDocument.createElement("main");
        contentRoot.setAttribute("data-cms-content", "");
        const paragraph = frameDocument.createElement("p");
        paragraph.textContent = "Target";
        contentRoot.append(paragraph);
        root.append(contentRoot);
        frameDocument.body.append(root);

        let didScrollFrameTarget = false;
        (paragraph as HTMLElement & { scrollIntoView(options?: ScrollIntoViewOptions): void }).scrollIntoView = () => {
            didScrollFrameTarget = true;
        };

        const shell = new Shell();
        document.body.append(shell);
        shell.connectedCallback();
        shell.setCatalog([{
            tag: "p",
            label: "Paragraph",
            bloc: HTMLElement as unknown as CustomElementConstructor,
            editor: ParagraphEditor,
        }]);
        shell.loadDocument({ root, contentRoot });

        const runtime = (shell as unknown as { _runtime: { getEditor(target: HTMLElement): Editor | undefined } })._runtime;
        const editor = runtime.getEditor(paragraph);
        if (!editor) throw new Error("Missing paragraph editor.");

        shell.shadowRoot!.querySelector("cms-editor-v2-structure-tree")!.dispatchEvent(new CustomEvent("editor-v2:select-editor", {
            bubbles: true,
            composed: true,
            detail: { editor },
        }));

        expect(didScrollFrameTarget).toBe(true);
    });

    test("shell does not loop when topbar definition resolves before upgrade", async () => {
        installDom();

        const { Shell } = await import("../src/exports");
        const originalWhenDefined = customElements.whenDefined.bind(customElements);
        const originalUpgrade = customElements.upgrade.bind(customElements);
        let whenDefinedCalls = 0;
        customElements.whenDefined = (() => {
            whenDefinedCalls += 1;
            return Promise.resolve(HTMLElement);
        }) as CustomElementRegistry["whenDefined"];
        customElements.upgrade = (() => undefined) as CustomElementRegistry["upgrade"];

        const shell = new Shell();
        const topbar = shell.shadowRoot!.querySelector("cms-editor-v2-topbar")!;
        Object.setPrototypeOf(topbar, HTMLElement.prototype);

        shell.setAttribute("resource", "snippet");
        shell.setAttribute("back-label", "Snippets");
        shell.setAttribute("settings-label", "Snippet settings");
        await Promise.resolve();
        await Promise.resolve();

        expect(whenDefinedCalls).toBe(1);

        customElements.whenDefined = originalWhenDefined;
        customElements.upgrade = originalUpgrade;
    });

    test("canvas uses location.replace for frame navigation", async () => {
        installDom();

        const { Canvas } = await import("../src/components/Layout/Canvas/Canvas");

        const canvas = new Canvas();
        document.body.append(canvas);

        const calls: string[] = [];
        const frame = canvas.shadowRoot!.querySelector("iframe")!;
        Object.defineProperty(frame, "contentWindow", {
            configurable: true,
            value: {
                location: {
                    replace(url: string): void {
                        calls.push(url);
                    },
                },
            },
        });

        canvas.setAttribute("frame-url", "/cms/api/editor/frame?type=snippet&id=s1");

        expect(calls).toEqual([
            "/cms/api/editor/frame?type=snippet&id=s1",
        ]);
        expect(frame.getAttribute("src")).not.toBe("/cms/api/editor/frame?type=snippet&id=s1");
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

    test("inserts catalog block default content", async () => {
        installDom();

        const { Shell } = await import("../src/exports");

        class ContainerEditor extends Editor {
            protected override contentSlots() {
                return [{
                    label: "Content",
                    accepts: [{ kind: "any-component" as const }],
                }];
            }
        }

        class CardEditor extends Editor {}

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
            setInsertItems?: (_items: unknown[]) => void;
            setStructure?: () => void;
        };
        structureTree.setInsertItems = () => undefined;
        structureTree.setStructure = () => undefined;
        shell.setCatalog([{
            tag: "demo-container",
            label: "Container",
            bloc: HTMLElement as unknown as CustomElementConstructor,
            editor: ContainerEditor,
        }, {
            tag: "demo-card",
            label: "Card",
            defaultContent: `<demo-card variant="featured"><p slot="header">Title</p><p>Body</p></demo-card>`,
            bloc: HTMLElement as unknown as CustomElementConstructor,
            editor: CardEditor,
        }]);
        (shell as unknown as { _frameDocument: Document })._frameDocument = frameDocument;
        shell.loadDocument({ root, contentRoot });

        const runtime = (shell as unknown as { _runtime: { getEditor(target: HTMLElement): Editor | undefined } })._runtime;
        const containerEditor = runtime.getEditor(container);
        if (!containerEditor) throw new Error("Missing container editor.");

        (shell as unknown as {
            _addChild(parent: Editor, item: unknown, slotName?: string): void;
        })._addChild(containerEditor, {
            kind: "block",
            entry: {
                tag: "demo-card",
                label: "Card",
                defaultContent: `<demo-card variant="featured"><p slot="header">Title</p><p>Body</p></demo-card>`,
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: CardEditor,
            },
        });

        expect(container.innerHTML).toBe(`<demo-card variant="featured"><p slot="header">Title</p><p>Body</p></demo-card>`);
    });

    test("keeps default content block root as the structure parent", async () => {
        installDom();

        const { Shell } = await import("../src/exports");

        class FigureEditor extends Editor {
            protected override contentSlots() {
                return [{
                    label:   "Image",
                    slot:    "image",
                    max:     1,
                    accepts: [{ kind: "any-component" as const }],
                }, {
                    label:   "Caption",
                    slot:    "caption",
                    max:     1,
                    accepts: [{ kind: "any-component" as const }],
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
        root.setAttribute("data-cms-editor-root", "");
        const contentRoot = frameDocument.createElement("div");
        contentRoot.setAttribute("data-cms-content", "");
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
            defaultContent: `<demo-figure><img slot="image" alt=""><p slot="caption">Caption</p></demo-figure>`,
            bloc: HTMLElement as unknown as CustomElementConstructor,
            editor: FigureEditor,
        }, {
            tag: "img",
            label: "Image",
            bloc: HTMLElement as unknown as CustomElementConstructor,
            editor: Editor,
        }, {
            tag: "p",
            label: "Paragraph",
            bloc: HTMLElement as unknown as CustomElementConstructor,
            editor: Editor,
        }]);
        (shell as unknown as { _frameDocument: Document })._frameDocument = frameDocument;
        shell.loadDocument({ root, contentRoot });

        (shell as unknown as { _addRoot(item: unknown): void })._addRoot({
            kind: "block",
            entry: {
                tag: "demo-figure",
                label: "Figure",
                defaultContent: `<demo-figure><img slot="image" alt=""><p slot="caption">Caption</p></demo-figure>`,
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: FigureEditor,
            },
        });

        const runtime = (shell as unknown as { _runtime: { getStructure(): EditorStructureNode[] } })._runtime;
        const structure = runtime.getStructure();

        expect(contentRoot.innerHTML).toBe(`<demo-figure><img slot="image" alt=""><p slot="caption">Caption</p></demo-figure>`);
        expect(structure.map(node => node.label)).toEqual(["Figure"]);
        expect(structure[0]?.children.map(node => node.label)).toEqual(["Image", "Paragraph"]);
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

    test("files center supports multiple file selection with a limit", async () => {
        installDom();
        document.head.innerHTML = `<meta name="basePath" content="/cms">`;

        globalThis.fetch = (async () => new Response(JSON.stringify({
            items: [
                { id: "one", name: "One.png", parentId: null, type: "file", mimeType: "image/png" },
                { id: "two", name: "Two.png", parentId: null, type: "file", mimeType: "image/png" },
                { id: "three", name: "Three.png", parentId: null, type: "file", mimeType: "image/png" },
            ],
        }), {
            headers: { "Content-Type": "application/json" },
        })) as typeof fetch;

        const { FilesCenter } = await import("../src/components/Controls/FilesCenter/FilesCenter");
        const center = new FilesCenter();
        const selected: string[][] = [];
        center.addEventListener("select-files", (event) => {
            selected.push((event as CustomEvent<{ files: { src: string }[] }>).detail.files.map(file => file.src));
        });
        document.body.append(center);
        center.connectedCallback();
        center.show({ multiple: true, maxSelection: 2 });
        await new Promise(resolve => setTimeout(resolve, 0));

        const items = Array.from(center.shadowRoot!.querySelectorAll<HTMLButtonElement>(".item"));
        items[0]!.click();
        items[1]!.click();
        items[2]!.click();
        center.shadowRoot!.querySelector<HTMLButtonElement>(".select")!.click();

        expect(selected).toEqual([[
            "/cms/.cms/files/by-id/one",
            "/cms/.cms/files/by-id/two",
        ]]);
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
        expect(control.shadowRoot!.querySelector(".file-title")?.textContent).toBe("Hero.png");
    });

    test("page link media-only mode hides tabs and renders selected file preview", async () => {
        installDom();
        document.head.innerHTML = `<meta name="basePath" content="/cms">`;

        const { PageLink } = await import("../src/components/Controls/PageLink/PageLink");
        const control = new PageLink();
        control.setAttribute("allow-page", "false");
        control.setAttribute("allow-external", "false");
        control.setAttribute("allow-media", "true");
        control.setAttribute("value", "/cms/.cms/files/by-id/hero");
        document.body.append(control);
        control.connectedCallback();

        expect(control.shadowRoot!.querySelector<HTMLElement>(".tabs")!.hidden).toBe(true);
        expect(control.shadowRoot!.querySelector(".file-title")?.textContent).toBe("Image");
        expect(control.shadowRoot!.querySelector<HTMLElement>(".file-value")!.hidden).toBe(true);
        expect(control.shadowRoot!.querySelector<HTMLImageElement>(".file-preview img")?.getAttribute("src")).toBe("/cms/.cms/files/by-id/hero");
        expect(control.shadowRoot!.querySelector<HTMLElement>(".target")!.hidden).toBe(true);
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

    test("shell inserts multiple media files up to slot capacity", async () => {
        installDom();
        document.head.innerHTML = `<meta name="basePath" content="/cms">`;

        globalThis.fetch = (async () => new Response(JSON.stringify({
            items: [
                { id: "one", name: "One.png", parentId: null, type: "file", mimeType: "image/png" },
                { id: "two", name: "Two.png", parentId: null, type: "file", mimeType: "image/png" },
                { id: "three", name: "Three.png", parentId: null, type: "file", mimeType: "image/png" },
            ],
        }), {
            headers: { "Content-Type": "application/json" },
        })) as typeof fetch;

        const { Shell } = await import("../src/exports");

        class GalleryEditor extends Editor {
            protected override contentSlots() {
                return [{
                    label: "Images",
                    slot: "image",
                    max: 3,
                    accepts: [{ kind: "media" as const, accept: ["image" as const] }],
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
        const gallery = frameDocument.createElement("demo-gallery");
        const existing = frameDocument.createElement("img");
        existing.setAttribute("slot", "image");
        gallery.append(existing);
        contentRoot.append(gallery);
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
            tag: "demo-gallery",
            label: "Gallery",
            bloc: HTMLElement as unknown as CustomElementConstructor,
            editor: GalleryEditor,
        }, {
            tag: "img",
            label: "Image",
            bloc: HTMLElement as unknown as CustomElementConstructor,
            editor: Editor,
        }]);
        (shell as unknown as { _frameDocument: Document })._frameDocument = frameDocument;
        shell.loadDocument({ root, contentRoot });

        const runtime = (shell as unknown as { _runtime: { getEditor(target: HTMLElement): Editor | undefined } })._runtime;
        const galleryEditor = runtime.getEditor(gallery);
        if (!galleryEditor) throw new Error("Missing gallery editor.");

        (shell as unknown as {
            _addChild(parent: Editor, item: unknown, slotName?: string): void;
        })._addChild(galleryEditor, {
            kind: "media",
            label: "Media",
            accept: ["image"],
        }, "image");
        await new Promise(resolve => setTimeout(resolve, 0));

        const center = document.body.querySelector("cms-editor-v2-files-center")!;
        const items = Array.from(center.shadowRoot!.querySelectorAll<HTMLButtonElement>(".item"));
        items[0]!.click();
        items[1]!.click();
        items[2]!.click();
        center.shadowRoot!.querySelector<HTMLButtonElement>(".select")!.click();

        const images = Array.from(gallery.querySelectorAll("img"));
        expect(images.map(image => image.getAttribute("src"))).toEqual([
            null,
            "/cms/.cms/files/by-id/one",
            "/cms/.cms/files/by-id/two",
        ]);
        expect(images.map(image => image.getAttribute("slot"))).toEqual(["image", "image", "image"]);
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

    test("shell writes repeat bindings with the stable syntax", async () => {
        installDom();

        const { Shell } = await import("../src/components/Layout/Shell/Shell");

        class CardEditor extends Editor { }

        const shell = new Shell();
        const target = document.createElement("demo-card");
        const editor = new CardEditor(target);

        (shell as unknown as {
            _setRepeat(editor: Editor, path: string, alias: string): void;
        })._setRepeat(editor, "data.items", "plan");

        expect(target.getAttribute("cms-repeat")).toBe("data.items as plan");
    });

    test("shell writes source bindings with the stable syntax", async () => {
        installDom();

        const { Shell } = await import("../src/components/Layout/Shell/Shell");

        class CardEditor extends Editor { }

        const shell = new Shell();
        const target = document.createElement("demo-card");
        const editor = new CardEditor(target);

        (shell as unknown as {
            _setSource(editor: Editor, source: { label: string; url: string; fields: [] }, binding: {
                url: string;
                alias: string;
                params: {
                    q: { from: "queryParam"; name: string };
                    limit: { from: "raw"; value: string };
                };
            }): void;
        })._setSource(editor, { label: "Plans", url: "/api/plans", fields: [] }, {
            url: "/api/plans",
            alias: "plans",
            params: {
                q: { from: "queryParam", name: "address" },
                limit: { from: "raw", value: "5" },
            },
        });

        expect(target.getAttribute("cms-source")).toBe("/api/plans?q=#{address}&limit=5 as plans");
    });


    test("structure tree expands collapsed parents to reveal selected children", async () => {
        installDom();

        const { StructureTree } = await import("../src/components/Layout/StructureTree/StructureTree");

        class DemoEditor extends Editor {}

        const parentTarget = document.createElement("demo-parent");
        const childTarget = document.createElement("demo-child");
        const parentEditor = new DemoEditor(parentTarget);
        const childEditor = new DemoEditor(childTarget);
        const childNode: EditorStructureNode = {
            editor: childEditor,
            target: childTarget,
            tag: "demo-child",
            label: "Child",
            badges: [],
            children: [],
        };
        const parentNode: EditorStructureNode = {
            editor: parentEditor,
            target: parentTarget,
            tag: "demo-parent",
            label: "Parent",
            badges: [],
            children: [childNode],
        };
        const tree = new StructureTree();
        document.body.append(tree);
        tree.setStructure([parentNode], null);
        tree.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.click();

        expect(Array.from(tree.shadowRoot!.querySelectorAll(".label")).map(label => label.textContent)).not.toContain("Child");

        tree.setStructure([parentNode], childEditor, [], { scrollSelectedIntoView: true });

        expect(Array.from(tree.shadowRoot!.querySelectorAll(".label")).map(label => label.textContent)).toContain("Child");
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
