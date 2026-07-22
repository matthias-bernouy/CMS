import {
    COMPOSITION_INPUT_ATTRIBUTE,
    COMPOSITION_RUNTIME_ATTRIBUTE,
    ChildEditor,
    DataRootEditor,
    Editor,
    EditorRuntime,
    OpaqueEditor,
    ParentEditor,
    RichTextParentEditor,
    SpanEditor,
    UnsafeCompositionEditor,
    blocConstructor,
    childContentSlot,
    childOverride,
    createDocument,
    dataScope,
    describe,
    expect,
    parentContentOverride,
    parseHTML,
    test,
    type ContentSlot,
    type DataScope,
    type EditorCatalog,
    type SettingSection,
} from "./support/index";

describe("EditorRuntime", () => {
    test("opaque editors hide their descendants from structure", () => {
        const { document, HTMLElement } = parseHTML(`
            <!DOCTYPE html>
            <html>
                <body>
                    <main id="content-root">
                        <x-opaque id="opaque">
                            <x-child id="child"></x-child>
                        </x-opaque>
                    </main>
                </body>
            </html>
        `);
        const runtime = new EditorRuntime([
            {
                tag: "x-opaque",
                label: "Opaque",
                bloc: blocConstructor(HTMLElement),
                editor: OpaqueEditor,
            },
            {
                tag: "x-child",
                label: "Child",
                bloc: blocConstructor(HTMLElement),
                editor: ChildEditor,
            },
        ]);

        runtime.load({
            root: document.getElementById("content-root")!,
            contentRoot: document.getElementById("content-root")!,
        });

        const structure = runtime.getStructure();
        expect(structure.map((node) => node.label)).toEqual(["Opaque"]);
        expect(structure[0]?.children).toEqual([]);
        expect(runtime.getEditor(document.getElementById("child")!)?.getSettings()).toEqual([
            {
                kind: "self",
                label: "Child",
                settings: [],
            },
        ]);
    });

    test("opaque editors own frame selection for their descendants", () => {
        const { document, HTMLElement } = parseHTML(`
            <!DOCTYPE html>
            <html>
                <body>
                    <main id="content-root">
                        <x-opaque id="opaque">
                            <x-child id="child"></x-child>
                        </x-opaque>
                    </main>
                </body>
            </html>
        `);
        const runtime = new EditorRuntime([
            {
                tag: "x-opaque",
                label: "Opaque",
                bloc: blocConstructor(HTMLElement),
                editor: OpaqueEditor,
            },
            {
                tag: "x-child",
                label: "Child",
                bloc: blocConstructor(HTMLElement),
                editor: ChildEditor,
            },
        ]);

        const opaque = document.getElementById("opaque")!;
        const child = document.getElementById("child")!;
        runtime.load({
            root: document.getElementById("content-root")!,
            contentRoot: document.getElementById("content-root")!,
        });

        expect(runtime.getClosestEditor(child)?.target).toBe(opaque);
    });

    test("requires contentRoot to be inside root", () => {
        const { document, HTMLElement } = createDocument();
        const runtime = new EditorRuntime([
            {
                tag: "x-parent",
                label: "Parent",
                bloc: blocConstructor(HTMLElement),
                editor: ParentEditor,
            },
        ]);

        expect(() =>
            runtime.load({
                root: document.getElementById("parent")!,
                contentRoot: document.getElementById("runtime-root")!,
            }),
        ).toThrow("EditorDocument contentRoot must be inside root.");
    });
});
