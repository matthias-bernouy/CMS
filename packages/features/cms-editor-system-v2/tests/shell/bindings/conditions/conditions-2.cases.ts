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
    test("shell writes source status conditions against a selected outer source", async () => {
        installDom();

        const { Shell } = await import("../../../../src/exports");

        class SourceEditor extends Editor {}
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
        const outer = frameDocument.createElement("demo-outer");
        outer.setAttribute("cms-source", "/api/outer");
        const inner = frameDocument.createElement("demo-inner");
        inner.setAttribute("cms-source", "/api/inner");
        const child = frameDocument.createElement("demo-child");
        inner.append(child);
        outer.append(inner);
        contentRoot.append(outer);
        root.append(contentRoot);
        frameDocument.body.append(root);

        const shell = new Shell();
        document.body.append(shell);
        shell.setCatalog([
            {
                tag: "demo-outer",
                label: "Outer",
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: SourceEditor,
            },
            {
                tag: "demo-inner",
                label: "Inner",
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: SourceEditor,
            },
            {
                tag: "demo-child",
                label: "Child",
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: ChildEditor,
            },
        ]);
        setShellFrameDocument(shell, frameDocument);
        shell.loadDocument({ root, contentRoot });

        const runtime = shellState(shell).runtime!;
        const outerEditor = runtime.getEditor(outer);
        const childEditor = runtime.getEditor(child);
        if (!outerEditor) {
            throw new Error("Missing outer editor.");
        }
        if (!childEditor) {
            throw new Error("Missing child editor.");
        }

        shellParts(shell).mutations.setSourceStatusCondition(childEditor, outerEditor, "error");

        expect(outer.getAttribute("cms-source-id")).toBe("demo-outer");
        expect(child.getAttribute("cms-condition")).toBe("$sources.demo-outer.error");
    });

    test("shell writes multiple source status conditions", async () => {
        installDom();

        const { Shell } = await import("../../../../src/exports");

        class DemoEditor extends Editor {}

        const outer = document.createElement("demo-outer");
        outer.setAttribute("cms-source", "/api/outer");
        const inner = document.createElement("demo-inner");
        inner.setAttribute("cms-source", "/api/inner");
        const child = document.createElement("demo-child");
        inner.append(child);
        outer.append(inner);
        const outerEditor = new DemoEditor(outer);
        const innerEditor = new DemoEditor(inner);
        const childEditor = new DemoEditor(child);
        const shell = new Shell();
        document.body.append(shell);

        shellParts(shell).mutations.setSourceStatusConditions(childEditor, [
            { sourceEditor: outerEditor, sourceState: "loaded" },
            { sourceEditor: innerEditor, sourceState: "empty" },
        ]);

        expect(outer.getAttribute("cms-source-id")).toBe("demo-outer");
        expect(inner.getAttribute("cms-source-id")).toBe("demo-inner");
        expect(child.getAttribute("cms-condition")).toBe("$sources.demo-outer.loaded || $sources.demo-inner.empty");
    });

    test("shell writes a generic condition expression", async () => {
        installDom();

        const { Shell } = await import("../../../../src/exports");
        class DemoEditor extends Editor {}
        const child = document.createElement("demo-child");
        const childEditor = new DemoEditor(child);
        const shell = new Shell();
        document.body.append(shell);

        shellParts(shell).mutations.setCondition(childEditor, 'plan.status == "active"');

        expect(child.getAttribute("cms-condition")).toBe('plan.status == "active"');
    });
});
