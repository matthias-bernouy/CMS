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
    test("shell reloads the view frame from the topbar reload action", async () => {
        installDom();

        const { Shell } = await import("../../../../src/exports");

        const shell = new Shell();
        document.body.append(shell);
        shell.connectedCallback();

        let reloads = 0;
        const canvas = shell.shadowRoot!.querySelector("cms-editor-v2-canvas") as HTMLElement & {
            reloadViewFrame(): void;
        };
        canvas.reloadViewFrame = () => {
            reloads += 1;
        };

        shell.shadowRoot!.querySelector("cms-editor-v2-topbar")!.dispatchEvent(
            new CustomEvent("editor-v2:view-reload", {
                bubbles: true,
                composed: true,
            }),
        );

        expect(reloads).toBe(1);
    });

    test("shell injects editor-only CSS to show only the selected source status condition", async () => {
        installDom();

        const { Shell } = await import("../../../../src/exports");
        const { document: frameDocument } = parseHTML(`
            <!DOCTYPE html>
            <html>
                <head></head>
                <body>
                    <div data-cms-editor-root>
                        <${CMS_BINDING_CORE_TAG}>
                            <main data-cms-content>
                                <section cms-source="/api/plans">
                                    <p cms-condition="$source.loaded">Loaded</p>
                                    <p cms-condition="$source.loading">Loading</p>
                                    <p cms-condition="$source.empty">Empty</p>
                                    <p cms-condition="$source.error">Error</p>
                                </section>
                            </main>
                        </${CMS_BINDING_CORE_TAG}>
                    </div>
                </body>
            </html>
        `);

        const shell = new Shell();
        document.body.append(shell);
        shellParts(shell).commands.bindFrameDocument(frameDocument);

        const css = frameDocument.getElementById("cms-editor-binding-preview-style")?.textContent ?? "";
        expect(css).toContain(`${CMS_BINDING_CORE_TAG}[${CMS_BINDING_ATTRIBUTES.bindingDisabled}]`);
        expect(css).toContain(
            `[${CMS_BINDING_ATTRIBUTES.condition}^="$source."]:not([${CMS_BINDING_ATTRIBUTES.condition}*=".loading"])`,
        );
        expect(css).toContain(
            `[${CMS_BINDING_ATTRIBUTES.condition}^="$sources."]:not([${CMS_BINDING_ATTRIBUTES.condition}*=".loading"])`,
        );
        expect(css).toContain(
            `[${CMS_BINDING_ATTRIBUTES.condition}^="$source."]:not([${CMS_BINDING_ATTRIBUTES.condition}*=".loaded"])`,
        );
        expect(css).toContain(
            `[${CMS_BINDING_ATTRIBUTES.condition}^="$source."]:not([${CMS_BINDING_ATTRIBUTES.condition}*=".empty"])`,
        );
        expect(css).toContain(
            `[${CMS_BINDING_ATTRIBUTES.condition}^="$source."]:not([${CMS_BINDING_ATTRIBUTES.condition}*=".error"])`,
        );
    });

    test("shell does not serialize binding preview attributes from the frame core", async () => {
        installDom();

        const { Shell } = await import("../../../../src/exports");
        const shell = new Shell();
        document.body.append(shell);

        const { document: frameDocument } = parseHTML(`
            <!DOCTYPE html>
            <html>
                <body>
                    <${CMS_BINDING_CORE_TAG} ${CMS_BINDING_ATTRIBUTES.bindingDisabled} ${CMS_BINDING_ATTRIBUTES.sourceStateForce}="loading">
                        <main data-cms-content><p>Hello</p></main>
                    </${CMS_BINDING_CORE_TAG}>
                </body>
            </html>
        `);

        setShellFrameDocument(shell, frameDocument);

        expect(shellParts(shell).commands.getContentHtml()).toBe("<p>Hello</p>");
    });
});
