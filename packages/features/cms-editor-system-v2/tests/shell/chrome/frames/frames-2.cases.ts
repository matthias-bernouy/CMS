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
    test("shell drives binding preview attributes across editor and view frames", async () => {
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
        contentRoot.innerHTML = "<p>Hello</p>";
        core.append(contentRoot);
        root.append(core);
        frameDocument.body.append(root);

        const { document: viewFrameDocument } = parseHTML(`
            <!DOCTYPE html>
            <html>
                <body></body>
            </html>
        `);
        const viewRoot = viewFrameDocument.createElement("div");
        viewRoot.setAttribute("data-cms-editor-root", "");
        const viewCore = viewFrameDocument.createElement(CMS_BINDING_CORE_TAG);
        const viewContentRoot = viewFrameDocument.createElement("main");
        viewContentRoot.setAttribute("data-cms-content", "");
        viewCore.append(viewContentRoot);
        viewRoot.append(viewCore);
        viewFrameDocument.body.append(viewRoot);

        const shell = new Shell();
        document.body.append(shell);
        shell.connectedCallback();
        shell.loadDocument({ root, contentRoot });
        setShellFrameDocument(shell, frameDocument);
        setShellViewFrameDocument(shell, viewFrameDocument);
        shellParts(shell).commands.syncEditorMode();

        expect(core.hasAttribute(CMS_BINDING_ATTRIBUTES.bindingDisabled)).toBe(true);
        expect(core.getAttribute(CMS_BINDING_ATTRIBUTES.sourceStateForce)).toBe("loading");
        expect(viewCore.hasAttribute(CMS_BINDING_ATTRIBUTES.bindingDisabled)).toBe(false);
        expect(viewCore.hasAttribute(CMS_BINDING_ATTRIBUTES.sourceStateForce)).toBe(false);

        shell.shadowRoot!.querySelector("cms-editor-v2-topbar")!.dispatchEvent(
            new CustomEvent("editor-v2:source-state-change", {
                bubbles: true,
                composed: true,
                detail: { sourceState: "empty" },
            }),
        );
        expect(core.getAttribute(CMS_BINDING_ATTRIBUTES.sourceStateForce)).toBe("empty");
        expect(core.hasAttribute(CMS_BINDING_ATTRIBUTES.bindingDisabled)).toBe(true);
        expect(viewCore.hasAttribute(CMS_BINDING_ATTRIBUTES.sourceStateForce)).toBe(false);
        expect(viewCore.hasAttribute(CMS_BINDING_ATTRIBUTES.bindingDisabled)).toBe(false);

        shell.shadowRoot!.querySelector("cms-editor-v2-topbar")!.dispatchEvent(
            new CustomEvent("editor-v2:editor-mode-change", {
                bubbles: true,
                composed: true,
                detail: { mode: "view" },
            }),
        );
        expect(core.hasAttribute(CMS_BINDING_ATTRIBUTES.bindingDisabled)).toBe(true);
        expect(core.getAttribute(CMS_BINDING_ATTRIBUTES.sourceStateForce)).toBe("empty");
        expect(viewCore.hasAttribute(CMS_BINDING_ATTRIBUTES.sourceStateForce)).toBe(false);
        expect(viewCore.hasAttribute(CMS_BINDING_ATTRIBUTES.bindingDisabled)).toBe(false);
        expect(shell.shadowRoot!.querySelector("cms-editor-v2-canvas")?.getAttribute("mode")).toBe("view");
    });

    test("shell restarts the view binding runtime after syncing frame content", async () => {
        installDom();

        const { Shell } = await import("../../../../src/exports");
        const { document: frameDocument } = parseHTML(`
            <!DOCTYPE html>
            <html>
                <body>
                    <div data-cms-editor-root>
                        <${CMS_BINDING_CORE_TAG}>
                            <main data-cms-content><input name="search" cms-param-sync="search"></main>
                        </${CMS_BINDING_CORE_TAG}>
                    </div>
                </body>
            </html>
        `);
        const { document: viewFrameDocument } = parseHTML(`
            <!DOCTYPE html>
            <html>
                <body>
                    <div data-cms-editor-root>
                        <${CMS_BINDING_CORE_TAG}>
                            <main data-cms-content></main>
                        </${CMS_BINDING_CORE_TAG}>
                    </div>
                </body>
            </html>
        `);
        const viewCore = viewFrameDocument.querySelector(CMS_BINDING_CORE_TAG) as HTMLElement & {
            runtime?: { stop(): void } | null;
            startRuntime?: () => void;
        };
        const calls: string[] = [];
        viewCore.runtime = { stop: () => calls.push("stop") };
        viewCore.startRuntime = () => calls.push("start");

        const shell = new Shell();
        document.body.append(shell);
        setShellFrameDocument(shell, frameDocument);
        setShellViewFrameDocument(shell, viewFrameDocument);

        shellParts(shell).commands.syncViewFrameContent();

        expect(viewFrameDocument.querySelector("[data-cms-content]")?.innerHTML).toBe(
            `<input name="search" cms-param-sync="search">`,
        );
        expect(calls).toEqual(["stop", "start"]);
    });
});
