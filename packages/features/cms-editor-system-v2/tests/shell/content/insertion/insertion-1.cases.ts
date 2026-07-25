import {
    CMS_BINDING_ATTRIBUTES,
    CMS_BINDING_CORE_TAG,
    Editor,
    applyParamSyncSetting,
    defineTextControls,
    describe,
    dynamicDataScopes,
    expect,
    installDom,
    openDynamicDataPicker,
    paramSyncSettings,
    parseHTML,
    setShellFrameDocument,
    setShellViewFrameDocument,
    shellParts,
    shellState,
    test,
    type BlockPickerSelectDetail,
    type DataScope,
    type EditorCatalog,
    type EditorCatalogEntry,
    type EditorStructureNode,
    type StructureTreeActionDetail,
    type TopBarSourceStateChangeDetail,
    type TopBarViewportChangeDetail,
} from "../../support/shellTestSupport";

describe("Shell", () => {
    test("serializes content after clearing binding runtime state", async () => {
        installDom();

        const { Shell } = await import("../../../../src/exports");
        const shell = new Shell();
        document.body.append(shell);

        const contentRoot = document.createElement("div");
        contentRoot.setAttribute("data-cms-content", "");
        contentRoot.innerHTML = `<demo-bloc cms-ready><p>Content</p></demo-bloc>`;
        const frameDocument = {
            querySelector: (selector: string) => (selector === "[data-cms-content]" ? contentRoot : null),
        };

        setShellFrameDocument(shell, frameDocument);

        expect(shellParts(shell).commands.getContentHtml()).toBe(`<demo-bloc><p>Content</p></demo-bloc>`);
    });

    test("makes image bindings inert before inserting template content", async () => {
        installDom();

        const { createInsertion } = await import("../../../../src/components/Layout/Shell/Domain/Mutations/insertion");
        const insertion = createInsertion(document, {
            kind: "template",
            id: "image-card",
            label: "Image card",
            content: `
                <img data-kind="dynamic" src="/media/{{ product.image }}.jpg">
                <img data-kind="static" src="/media/static.jpg">
            `,
        });
        document.body.append(insertion.fragment);

        const dynamicImage = document.querySelector('[data-kind="dynamic"]');
        const staticImage = document.querySelector('[data-kind="static"]');
        expect(dynamicImage?.getAttribute("src")).toBeNull();
        expect(dynamicImage?.getAttribute("data-cms-src")).toBe("/media/{{ product.image }}.jpg");
        expect(staticImage?.getAttribute("src")).toBe("/media/static.jpg");
        expect(staticImage?.getAttribute("data-cms-src")).toBeNull();
    });

    test("inserts template fragments into selected content slots", async () => {
        installDom();

        const { Shell } = await import("../../../../src/exports");

        class ContainerEditor extends Editor {
            protected override contentSlots() {
                return [
                    {
                        label: "Content",
                        accepts: [{ kind: "any-component" as const }],
                    },
                ];
            }
        }

        class ParagraphEditor extends Editor {}

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
        shell.setCatalog([
            {
                tag: "demo-container",
                label: "Container",
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: ContainerEditor,
            },
            {
                tag: "p",
                label: "Paragraph",
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: ParagraphEditor,
            },
        ]);
        setShellFrameDocument(shell, frameDocument);
        shell.loadDocument({ root, contentRoot });

        const runtime = shellState(shell).runtime!;
        const parentEditor = runtime.getEditor(container);
        if (!parentEditor) {
            throw new Error("Missing container editor.");
        }

        shellParts(shell).mutations.addChild(parentEditor, {
            kind: "template",
            id: "tpl-hero",
            label: "Hero template",
            content: `<p>Inserted from template</p><w13c-reserved-example data-id="main-nav"></w13c-reserved-example>`,
        });

        expect(container.innerHTML).toBe(
            `<p>Inserted from template</p><w13c-reserved-example data-id="main-nav"></w13c-reserved-example>`,
        );
    });
});
