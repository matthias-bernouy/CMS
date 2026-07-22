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
    test("shell preserves source status conditions when replacing children", async () => {
        installDom();

        const { Shell } = await import("../../../../src/exports");
        const { StructureTree } = await import("../../../../src/components/Layout/StructureTree/StructureTree");
        if (!customElements.get("cms-editor-v2-structure-tree")) {
            customElements.define("cms-editor-v2-structure-tree", class extends StructureTree {});
        }

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

        class ChildEditor extends Editor {}

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
        container.setAttribute("cms-source", "/api/plans");
        container.innerHTML = `<demo-child cms-condition="$source.empty">Old empty</demo-child>`;
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
                tag: "demo-child",
                label: "Child",
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: ChildEditor,
                defaultContent: "<demo-child>New empty</demo-child>",
            },
        ]);
        setShellFrameDocument(shell, frameDocument);
        shell.loadDocument({ root, contentRoot });

        const runtime = shellState(shell).runtime!;
        const childEditor = runtime.getEditor(container.querySelector("demo-child") as HTMLElement);
        if (!childEditor) {
            throw new Error("Missing child editor.");
        }

        shellParts(shell).mutations.replaceEditor(childEditor, {
            kind: "block",
            entry: {
                tag: "demo-child",
                label: "Child",
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: ChildEditor,
                defaultContent: "<demo-child>New empty</demo-child>",
            },
        });

        expect(container.innerHTML).toBe(`<demo-child cms-condition="$source.empty">New empty</demo-child>`);
    });
});
