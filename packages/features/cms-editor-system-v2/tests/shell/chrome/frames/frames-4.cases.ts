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
    test("shell saves editor frame content without leaving view mode", async () => {
        installDom();

        const { Shell } = await import("../../../../src/exports");
        const { document: frameDocument } = parseHTML(`
            <!DOCTYPE html>
            <html>
                <body></body>
            </html>
        `);
        const root = frameDocument.createElement("div");
        root.setAttribute("data-cms-editor-root", "");
        const core = frameDocument.createElement(CMS_BINDING_CORE_TAG);
        const contentRoot = frameDocument.createElement("main");
        contentRoot.setAttribute("data-cms-content", "");
        contentRoot.innerHTML = `<section cms-source="/api/plans"><p>Authored</p><p cms-condition="$source.loading">Loading</p></section>`;
        core.append(contentRoot);
        root.append(core);
        frameDocument.body.append(root);

        const shell = new Shell();
        document.body.append(shell);
        shell.connectedCallback();
        shellState(shell).pageConfig = {
            id: "page-1",
            title: "Pricing",
            path: "/pricing",
            description: "Pricing page",
            tags: [],
            published: true,
        };
        shell.loadDocument({ root, contentRoot });
        setShellFrameDocument(shell, frameDocument);

        shell.shadowRoot!.querySelector("cms-editor-v2-topbar")!.dispatchEvent(
            new CustomEvent("editor-v2:editor-mode-change", {
                bubbles: true,
                composed: true,
                detail: { mode: "view" },
            }),
        );
        expect(core.hasAttribute(CMS_BINDING_ATTRIBUTES.bindingDisabled)).toBe(true);

        let savedContent = "";
        shell.addEventListener("editor-v2:save-document", (event) => {
            savedContent = (event as CustomEvent<{ content: string }>).detail.content;
        });
        shellParts(shell).commands.saveDocument();

        expect(core.hasAttribute(CMS_BINDING_ATTRIBUTES.bindingDisabled)).toBe(true);
        expect(shell.shadowRoot!.querySelector("cms-editor-v2-canvas")?.getAttribute("mode")).toBe("view");
        expect(savedContent).toBe(
            `<section cms-source="/api/plans"><p>Authored</p><p cms-condition="$source.loading">Loading</p></section>`,
        );
    });

    test("shell keeps the editor runtime stable when switching between view and edit", async () => {
        installDom();

        const { Shell } = await import("../../../../src/exports");
        const { document: frameDocument } = parseHTML(`
            <!DOCTYPE html>
            <html>
                <body></body>
            </html>
        `);
        const root = frameDocument.createElement("div");
        root.setAttribute("data-cms-editor-root", "");
        const core = frameDocument.createElement(CMS_BINDING_CORE_TAG);
        const contentRoot = frameDocument.createElement("main");
        contentRoot.setAttribute("data-cms-content", "");
        contentRoot.innerHTML = `<section cms-source="/api/plans"><p>Authored</p></section>`;
        core.append(contentRoot);
        root.append(core);
        frameDocument.body.append(root);

        const shell = new Shell();
        document.body.append(shell);
        shell.connectedCallback();
        shell.loadDocument({ root, contentRoot });
        setShellFrameDocument(shell, frameDocument);

        let reloads = 0;
        const originalLoadDocument = shell.loadDocument.bind(shell);
        shell.loadDocument = ((documentArg, selectedTarget) => {
            reloads += 1;
            originalLoadDocument(documentArg, selectedTarget);
        }) as Shell["loadDocument"];

        shell.shadowRoot!.querySelector("cms-editor-v2-topbar")!.dispatchEvent(
            new CustomEvent("editor-v2:editor-mode-change", {
                bubbles: true,
                composed: true,
                detail: { mode: "view" },
            }),
        );
        shell.shadowRoot!.querySelector("cms-editor-v2-topbar")!.dispatchEvent(
            new CustomEvent("editor-v2:editor-mode-change", {
                bubbles: true,
                composed: true,
                detail: { mode: "edit" },
            }),
        );
        await Promise.resolve();

        expect(reloads).toBe(0);
    });
});
