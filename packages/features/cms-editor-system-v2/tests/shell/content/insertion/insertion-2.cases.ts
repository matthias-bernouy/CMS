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
    test("creates and validates the required managed native child during insertion", async () => {
        installDom();

        const { createInsertion } = await import("../../../../src/components/Layout/Shell/Domain/Mutations/insertion");
        class LinkEditor extends Editor {}
        const entry = {
            tag: "demo-link",
            label: "Link",
            nativeElement: "a",
            bloc: HTMLElement as unknown as CustomElementConstructor,
            editor: LinkEditor,
        };

        const generated = createInsertion(document, { kind: "block", entry });
        const host = generated?.fragment.firstElementChild;
        expect(host?.outerHTML).toBe("<demo-link><a></a></demo-link>");

        const invalid = createInsertion(document, {
            kind: "block",
            entry: { ...entry, defaultContent: "<demo-link><span>Wrong</span></demo-link>" },
        });
        expect(invalid).toBeNull();
    });

    test("inserts catalog block default content", async () => {
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
            setStructure?: () => void;
        };
        structureTree.setStructure = () => undefined;
        shell.setCatalog([
            {
                tag: "demo-container",
                label: "Container",
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: ContainerEditor,
            },
            {
                tag: "demo-card",
                label: "Card",
                defaultContent: `<demo-card variant="featured"><p slot="header">Title</p><p>Body</p></demo-card>`,
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: CardEditor,
            },
        ]);
        setShellFrameDocument(shell, frameDocument);
        shell.loadDocument({ root, contentRoot });

        const runtime = shellState(shell).runtime!;
        const containerEditor = runtime.getEditor(container);
        if (!containerEditor) {
            throw new Error("Missing container editor.");
        }

        shellParts(shell).mutations.addChild(containerEditor, {
            kind: "block",
            entry: {
                tag: "demo-card",
                label: "Card",
                defaultContent: `<demo-card variant="featured"><p slot="header">Title</p><p>Body</p></demo-card>`,
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: CardEditor,
            },
        });

        expect(container.innerHTML).toBe(
            `<demo-card variant="featured"><p slot="header">Title</p><p>Body</p></demo-card>`,
        );
    });
});
