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
    test("shell applies source status conditions to existing children", async () => {
        installDom();

        const { Shell } = await import("../../../../src/exports");

        class ContainerEditor extends Editor {
            protected override contentSlots() {
                return [
                    {
                        label: "Content",
                        max: 1,
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
        root.setAttribute("data-cms-editor-root", "");
        const contentRoot = frameDocument.createElement("main");
        contentRoot.setAttribute("data-cms-content", "");
        const container = frameDocument.createElement("demo-container");
        const paragraph = frameDocument.createElement("p");
        container.setAttribute("cms-source", "/api/plans");
        paragraph.textContent = "Empty message";
        container.append(paragraph);
        contentRoot.append(container);
        root.append(contentRoot);
        frameDocument.body.append(root);

        const shell = new Shell();
        document.body.append(shell);
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
                defaultContent: "<p>Empty message</p>",
            },
        ]);
        setShellFrameDocument(shell, frameDocument);
        shell.loadDocument({ root, contentRoot });

        const runtime = shellState(shell).runtime!;
        const parentEditor = runtime.getEditor(container);
        const paragraphEditor = runtime.getEditor(paragraph);
        if (!parentEditor) {
            throw new Error("Missing container editor.");
        }
        if (!paragraphEditor) {
            throw new Error("Missing paragraph editor.");
        }

        shellParts(shell).mutations.setSourceStatusCondition(paragraphEditor, parentEditor, "empty");

        expect(container.getAttribute("cms-source-id")).toBe("demo-container");
        expect(container.innerHTML).toBe(`<p cms-condition="$sources.demo-container.empty">Empty message</p>`);
    });
});
