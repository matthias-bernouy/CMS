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
    test("shell cleans repeat bindings from child editors when removing a source", async () => {
        installDom();

        const { Shell } = await import("../../../../src/exports");

        class GridEditor extends Editor {
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
        root.setAttribute("data-cms-editor-root", "");
        const contentRoot = frameDocument.createElement("main");
        contentRoot.setAttribute("data-cms-content", "");
        const grid = frameDocument.createElement("demo-grid");
        grid.setAttribute(CMS_BINDING_ATTRIBUTES.source, "/api/plans as data");
        grid.setAttribute("cms-ready", "");
        grid.innerHTML = `
            <demo-card cms-repeat="data.features as feature">
                <h2>{{ feature.title }}</h2>
                <p>{{ unrelated.label }}</p>
            </demo-card>
        `;
        contentRoot.append(grid);
        root.append(contentRoot);
        frameDocument.body.append(root);

        const shell = new Shell();
        document.body.append(shell);
        shell.setCatalog([
            {
                tag: "demo-grid",
                label: "Grid",
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: GridEditor,
            },
            {
                tag: "demo-card",
                label: "Card",
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: CardEditor,
            },
        ]);
        setShellFrameDocument(shell, frameDocument);
        shell.loadDocument({ root, contentRoot });

        const runtime = shellState(shell).runtime!;
        const gridEditor = runtime.getEditor(grid);
        if (!gridEditor) {
            throw new Error("Missing grid editor.");
        }

        const originalConfirm = globalThis.confirm;
        globalThis.confirm = (() => true) as typeof globalThis.confirm;
        try {
            shellParts(shell).mutations.removeSource(gridEditor);
        } finally {
            globalThis.confirm = originalConfirm;
        }

        const card = grid.querySelector("demo-card")!;
        expect(grid.hasAttribute(CMS_BINDING_ATTRIBUTES.source)).toBe(false);
        expect(grid.hasAttribute("cms-ready")).toBe(false);
        expect(card.hasAttribute(CMS_BINDING_ATTRIBUTES.repeat)).toBe(false);
        expect(card.querySelector("h2")?.textContent).toBe("");
        expect(card.querySelector("p")?.textContent).toBe("{{ unrelated.label }}");
    });

    test("shell cleans repeat bindings from the removed source element", async () => {
        installDom();

        const { Shell } = await import("../../../../src/exports");

        const source = document.createElement("section");
        source.setAttribute(CMS_BINDING_ATTRIBUTES.source, "/api/plans as plans");
        source.setAttribute(CMS_BINDING_ATTRIBUTES.repeat, "items as plan");
        source.innerHTML = `<h2>{{ plan.title }}</h2><p>{{ unrelated.label }}</p>`;
        const editor = new Editor(source);
        const shell = new Shell();
        document.body.append(shell);

        const originalConfirm = globalThis.confirm;
        globalThis.confirm = (() => true) as typeof globalThis.confirm;
        try {
            shellParts(shell).mutations.removeSource(editor);
        } finally {
            globalThis.confirm = originalConfirm;
        }

        expect(source.hasAttribute(CMS_BINDING_ATTRIBUTES.source)).toBe(false);
        expect(source.hasAttribute(CMS_BINDING_ATTRIBUTES.repeat)).toBe(false);
        expect(source.querySelector("h2")?.textContent).toBe("");
        expect(source.querySelector("p")?.textContent).toBe("{{ unrelated.label }}");
    });
});
