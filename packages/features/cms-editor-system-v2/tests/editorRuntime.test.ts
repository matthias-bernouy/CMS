import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import {
    Editor,
    type ContentSlot,
    type DataScope,
    type EditorCatalog,
    type SettingSection,
} from "@bernouy/cms-content/editor";
import { EditorRuntime } from "../src/runtime";

function createDocument() {
    return parseHTML(`
        <!DOCTYPE html>
        <html>
            <body>
                <x-data id="runtime-root">
                    <main id="content-root">
                        <x-parent id="parent">
                            <x-child id="child"></x-child>
                        </x-parent>
                    </main>
                </x-data>
            </body>
        </html>
    `);
}

function blocConstructor(HTMLElementCtor: typeof HTMLElement): CustomElementConstructor {
    return class TestBloc extends HTMLElementCtor { } as unknown as CustomElementConstructor;
}

const dataScope: DataScope = {
    name: "plans",
    label: "Plans",
    source: "urn:test:plans",
    fields: [
        { path: "name", type: "string" },
    ],
};

const childOverride: SettingSection = {
    kind: "surcharge",
    label: "Parent override",
    settings: [
        {
            type: "select",
            label: "Column span",
            attribute: "column-span",
            options: [
                { label: "Auto", value: "auto" },
                { label: "Full", value: "full" },
            ],
        },
    ],
};

const childContentSlot: ContentSlot = {
    label: "Child actions",
    min: 1,
    max: 1,
    accepts: [{ kind: "component", tag: "button" }],
};

const parentContentOverride: ContentSlot = {
    label: "Parent slot override",
    slot: "actions",
    max: 2,
    accepts: [{ kind: "component", tag: "button" }],
};

class DataRootEditor extends Editor {
    override mountEditor(): void {
        this.declareDataScope(dataScope);
    }
}

class ParentEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Parent",
                settings: [],
            },
        ];
    }

    override mountEditor(): void {
        for (const child of this.getChildren()) {
            child.addSettings(childOverride);
            child.addContentSlots(parentContentOverride);
        }
    }
}

class ChildEditor extends Editor {
    protected override textCapability() {
        return {
            format: "richtext" as const,
            bold: true,
            dynamic: true,
        };
    }

    protected override contentSlots(): ContentSlot[] {
        return [childContentSlot];
    }

    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Child",
                settings: [],
            },
        ];
    }
}

class OpaqueEditor extends Editor {
    protected override structureMode() {
        return "opaque" as const;
    }
}

describe("EditorRuntime", () => {
    test("loads editors from root and builds structure from contentRoot", () => {
        const { document, HTMLElement } = createDocument();
        const catalog: EditorCatalog = [
            {
                tag: "x-data",
                label: "Data root",
                bloc: blocConstructor(HTMLElement),
                editor: DataRootEditor,
            },
            {
                tag: "x-parent",
                label: "Parent",
                bloc: blocConstructor(HTMLElement),
                editor: ParentEditor,
            },
            {
                tag: "x-child",
                label: "Child",
                bloc: blocConstructor(HTMLElement),
                editor: ChildEditor,
            },
        ];
        const root = document.getElementById("runtime-root")!;
        const contentRoot = document.getElementById("content-root")!;
        const child = document.getElementById("child")!;
        const runtime = new EditorRuntime(catalog);

        runtime.load({ root, contentRoot });

        const structure = runtime.getStructure();
        expect(structure.map(node => node.label)).toEqual(["Parent"]);
        expect(structure[0]?.children.map(node => node.label)).toEqual(["Child"]);
        expect(runtime.registry.getEditor(root)?.getDataScopes()).toEqual([dataScope]);
        expect(runtime.getSelectedSettings()).toEqual([]);

        runtime.select(child);

        expect(runtime.getSelectedSettings()).toEqual([
            {
                kind: "self",
                label: "Child",
                settings: [],
            },
            childOverride,
        ]);
        expect(runtime.getSelection()?.contentSlots).toEqual([
            childContentSlot,
            parentContentOverride,
        ]);
        expect(runtime.getSelection()?.textCapability).toEqual({
            format: "richtext",
            bold: true,
            dynamic: true,
        });
        expect(runtime.getSelectedDataScopes()).toEqual([dataScope]);
    });

    test("closest editor keeps the clicked descendant when no opaque ancestor exists", () => {
        const { document, HTMLElement } = createDocument();
        const runtime = new EditorRuntime([
            {
                tag: "x-parent",
                label: "Parent",
                bloc: blocConstructor(HTMLElement),
                editor: ParentEditor,
            },
            {
                tag: "x-child",
                label: "Child",
                bloc: blocConstructor(HTMLElement),
                editor: ChildEditor,
            },
        ]);

        const contentRoot = document.getElementById("content-root")!;
        const child = document.getElementById("child")!;

        runtime.load({
            root: contentRoot,
            contentRoot,
        });

        expect(runtime.getClosestEditor(child)?.target).toBe(child);
    });

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
        expect(structure.map(node => node.label)).toEqual(["Opaque"]);
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

        expect(() => runtime.load({
            root: document.getElementById("parent")!,
            contentRoot: document.getElementById("runtime-root")!,
        })).toThrow("EditorDocument contentRoot must be inside root.");
    });
});
