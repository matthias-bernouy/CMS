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
    test("shell scrolls frame target into view when selected from structure", async () => {
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
        shell.setCatalog([
            {
                tag: "p",
                label: "Paragraph",
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: ParagraphEditor,
            },
        ]);
        shell.loadDocument({ root, contentRoot });

        const runtime = shellState(shell).runtime!;
        const editor = runtime.getEditor(paragraph);
        if (!editor) {
            throw new Error("Missing paragraph editor.");
        }

        shell.shadowRoot!.querySelector("cms-editor-v2-structure-tree")!.dispatchEvent(
            new CustomEvent("editor-v2:select-editor", {
                bubbles: true,
                composed: true,
                detail: { editor },
            }),
        );

        expect(didScrollFrameTarget).toBe(true);
    });

    test("shell does not loop when topbar definition resolves before upgrade", async () => {
        installDom();

        const { Shell } = await import("../../../../src/exports");
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

        shell.setAttribute("resource", "template");
        shell.setAttribute("back-label", "Templates");
        shell.setAttribute("settings-label", "Template settings");
        await Promise.resolve();
        await Promise.resolve();

        expect(whenDefinedCalls).toBe(1);

        customElements.whenDefined = originalWhenDefined;
        customElements.upgrade = originalUpgrade;
    });

    test("canvas uses location.replace for frame navigation", async () => {
        installDom();

        const { Canvas } = await import("../../../../src/components/Layout/Canvas/Canvas");

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

        canvas.setAttribute("frame-url", "/cms/api/editor/frame?type=template&id=t1");

        expect(calls).toEqual(["/cms/api/editor/frame?type=template&id=t1"]);
        expect(frame.getAttribute("src")).not.toBe("/cms/api/editor/frame?type=template&id=t1");
    });
});
