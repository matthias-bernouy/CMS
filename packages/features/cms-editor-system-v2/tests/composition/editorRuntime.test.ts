import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import {
    Editor,
    type ContentSlot,
} from "@bernouy/cms-content/editor";
import {
    COMPOSITION_INPUT_ATTRIBUTE,
    COMPOSITION_OUTPUT_ATTRIBUTE,
    COMPOSITION_RUNTIME_ATTRIBUTE,
} from "@bernouy/components/base";
import {
    EditorRegistry,
    EditorRuntime,
    RuntimeEditor,
} from "../../src/runtime";

const childSlot: ContentSlot = {
    label: "Child actions",
    accepts: [{ kind: "any-component" }],
};

class UnsafeCompositionEditor extends Editor {
    protected override contentSlots(): ContentSlot[] {
        return [childSlot];
    }

    protected override textCapability() {
        return { format: "text" as const, dynamic: true };
    }
}

function blocConstructor(HTMLElementCtor: typeof HTMLElement): CustomElementConstructor {
    return class TestBloc extends HTMLElementCtor { } as unknown as CustomElementConstructor;
}

describe("composition editor runtime", () => {
    test("treats generated composition content as an opaque runtime detail", () => {
        const { document, HTMLElement } = parseHTML(`
            <main id="content-root">
                <x-parent id="composition" ${COMPOSITION_RUNTIME_ATTRIBUTE}>
                    <template ${COMPOSITION_INPUT_ATTRIBUTE}></template>
                    <p9r-composition-output ${COMPOSITION_OUTPUT_ATTRIBUTE}>
                        <x-child id="generated"></x-child>
                        <x-parent id="nested-composition" ${COMPOSITION_RUNTIME_ATTRIBUTE}>
                            <template ${COMPOSITION_INPUT_ATTRIBUTE}></template>
                            <x-child id="nested-generated"></x-child>
                        </x-parent>
                    </p9r-composition-output>
                </x-parent>
            </main>
        `);
        const runtime = new EditorRuntime([
            {
                tag: "x-parent",
                label: "Composition",
                bloc: blocConstructor(HTMLElement),
                editor: UnsafeCompositionEditor,
            },
            {
                tag: "x-child",
                label: "Generated child",
                bloc: blocConstructor(HTMLElement),
                editor: Editor,
            },
        ]);
        const contentRoot = document.getElementById("content-root")!;
        const composition = document.getElementById("composition")!;
        const generated = document.getElementById("generated")!;
        const nestedComposition = document.getElementById("nested-composition")!;
        const nestedGenerated = document.getElementById("nested-generated")!;

        runtime.load({ root: contentRoot, contentRoot });

        expect(runtime.getStructure().map(node => node.label)).toEqual(["Composition"]);
        expect(runtime.getEditor(generated)).toBeUndefined();
        expect(runtime.getEditor(nestedComposition)).toBeUndefined();
        expect(runtime.getClosestEditor(generated)?.target).toBe(composition);
        expect(runtime.getClosestEditor(nestedGenerated)?.target).toBe(composition);
        runtime.select(composition);
        expect(runtime.getSelection()?.contentSlots).toEqual([]);
        expect(runtime.getSelection()?.textCapability).toBeNull();
    });

    test("keeps the exported RuntimeEditor guard consistent", () => {
        const { document } = parseHTML(`
            <x-parent id="composition" ${COMPOSITION_RUNTIME_ATTRIBUTE}>
                <template ${COMPOSITION_INPUT_ATTRIBUTE}></template>
            </x-parent>
        `);
        const editor = new RuntimeEditor(
            document.getElementById("composition")!,
            new EditorRegistry(),
        );

        editor.addContentSlots(childSlot);
        editor.setTextCapability({ format: "text", dynamic: true });

        expect(editor.getContentSlots()).toEqual([]);
        expect(editor.getTextCapability()).toBeNull();
    });
});
