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
    test("shell applies resource chrome attributes", async () => {
        installDom();

        const { TopBar } = await import("../../../../src/components/Layout/TopBar/TopBar");
        if (!customElements.get("cms-editor-v2-topbar")) {
            customElements.define("cms-editor-v2-topbar", class extends TopBar {});
        }

        const { Shell } = await import("../../../../src/exports");
        const { StructureTree } = await import("../../../../src/components/Layout/StructureTree/StructureTree");
        if (!customElements.get("cms-editor-v2-structure-tree")) {
            customElements.define("cms-editor-v2-structure-tree", class extends StructureTree {});
        }

        const shell = new Shell();
        shell.setAttribute("resource", "page");
        shell.setAttribute("back-href", "/cms/admin/pages");
        shell.setAttribute("back-label", "Pages");
        shell.setAttribute("settings-label", "Page settings");
        shell.setAttribute("settings-title", "Page settings");
        shell.setAttribute("settings-description", "Configure page metadata.");
        shell.setAttribute("settings-path-label", "Path");
        shell.setAttribute("settings-tags-label", "Tags");
        document.body.append(shell);

        const topbar = shell.shadowRoot!.querySelector("cms-editor-v2-topbar")!;
        const back = topbar.shadowRoot!.querySelector<HTMLAnchorElement>(".back")!;

        expect(back.getAttribute("href")).toBe("/cms/admin/pages");
        expect(topbar.shadowRoot!.querySelector(".back-label")!.textContent).toBe("Pages");
        expect(topbar.shadowRoot!.querySelector(".settings-label")!.textContent).toBe("Page settings");
        expect(shell.shadowRoot!.querySelector("#page-settings-title")!.textContent).toBe("Page settings");
        expect(shell.shadowRoot!.querySelector(".settings-description")!.textContent).toBe("Configure page metadata.");
        expect(shell.shadowRoot!.querySelector('[data-page-label="path"]')!.textContent).toBe("Path");
        expect(shell.shadowRoot!.querySelector('[data-page-label="tags"]')!.textContent).toBe("Tags");
        expect(shell.shadowRoot!.querySelector('[data-page-field="path"]')!.hasAttribute("disabled")).toBe(false);
        expect(shell.shadowRoot!.querySelector('[data-page-field="published"]')!.closest("label")!.hidden).toBe(false);
    });

    test("resolves an external page settings destination against the editor URL", async () => {
        const { resolveExternalSettingsHref } = await import(
            "../../../../src/components/Layout/Shell/Controller/Events/shellEvents"
        );

        expect(
            resolveExternalSettingsHref(
                "/cms/admin/pages/detail?id=page-1",
                "https://cms.test/cms/editor/page?id=page-1",
            ),
        ).toBe("https://cms.test/cms/admin/pages/detail?id=page-1");
    });

    test("shell treats an empty paragraph as empty page content", async () => {
        installDom();

        const { Shell } = await import("../../../../src/exports");

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
        contentRoot.innerHTML = "<p></p>";
        root.append(contentRoot);
        frameDocument.body.append(root);

        const shell = new Shell();
        document.body.append(shell);
        shell.setCatalog([
            {
                tag: "p",
                label: "Paragraph",
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: ParagraphEditor,
            },
            {
                tag: "main",
                label: "Main",
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: ParagraphEditor,
                defaultContent: "<main></main>",
            },
        ]);

        let renderedStructure: EditorStructureNode[] | undefined;
        const structureTree = shell.shadowRoot!.querySelector("cms-editor-v2-structure-tree") as Element & {
            setStructure?: (nodes: EditorStructureNode[]) => void;
        };
        structureTree.setStructure = (nodes) => {
            renderedStructure = nodes;
        };

        setShellFrameDocument(shell, frameDocument);
        shell.loadDocument({ root, contentRoot });
        expect(renderedStructure).toEqual([]);

        shellParts(shell).mutations.addRoot({
            kind: "block",
            entry: {
                tag: "main",
                label: "Main",
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: ParagraphEditor,
                defaultContent: "<main></main>",
            },
        });

        expect(contentRoot.innerHTML).toBe("<main></main>");
    });
});
