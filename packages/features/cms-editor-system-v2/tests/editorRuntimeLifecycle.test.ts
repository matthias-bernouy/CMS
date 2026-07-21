import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { Editor, type EditorCatalog } from "@bernouy/cms-content/editor";
import { EditorRuntime } from "../src/runtime";

function editorDocument(markup: string) {
    const { document, HTMLElement } = parseHTML(`<main data-content>${markup}</main>`);
    const contentRoot = document.querySelector<HTMLElement>("[data-content]")!;
    return { contentRoot, HTMLElement };
}

function catalog(HTMLElementConstructor: typeof HTMLElement, events: string[]): EditorCatalog {
    class LifecycleEditor extends Editor {
        override mountEditor(): void {
            events.push(`mount:${this.target.id}`);
        }

        override unmountEditor(): void {
            events.push(`unmount:${this.target.id}`);
        }
    }

    return [
        {
            tag: "x-lifecycle",
            label: "Lifecycle",
            bloc: class extends HTMLElementConstructor {} as unknown as CustomElementConstructor,
            editor: LifecycleEditor,
        },
    ];
}

describe("EditorRuntime lifecycle", () => {
    test("unmounts the previous document in reverse order before loading the next one", () => {
        const first = editorDocument(`
            <x-lifecycle id="parent">
                <x-lifecycle id="child"></x-lifecycle>
            </x-lifecycle>
        `);
        const second = editorDocument(`<x-lifecycle id="replacement"></x-lifecycle>`);
        const events: string[] = [];
        const runtime = new EditorRuntime(catalog(first.HTMLElement, events));
        const oldParent = first.contentRoot.querySelector<HTMLElement>("#parent")!;
        const oldChild = first.contentRoot.querySelector<HTMLElement>("#child")!;
        const replacement = second.contentRoot.querySelector<HTMLElement>("#replacement")!;

        runtime.load({ root: first.contentRoot, contentRoot: first.contentRoot });
        runtime.select(oldChild);
        runtime.load({ root: second.contentRoot, contentRoot: second.contentRoot });

        expect(events).toEqual(["mount:parent", "mount:child", "unmount:child", "unmount:parent", "mount:replacement"]);
        expect(runtime.getEditor(oldParent)).toBeUndefined();
        expect(runtime.getEditor(oldChild)).toBeUndefined();
        expect(runtime.getEditor(replacement)).toBeDefined();
        expect(runtime.getSelection()).toBeNull();
    });

    test("disposes a loaded document idempotently", () => {
        const { contentRoot, HTMLElement } = editorDocument(`<x-lifecycle id="editor"></x-lifecycle>`);
        const events: string[] = [];
        const runtime = new EditorRuntime(catalog(HTMLElement, events));
        const target = contentRoot.querySelector<HTMLElement>("#editor")!;

        runtime.load({ root: contentRoot, contentRoot });
        runtime.dispose();
        runtime.dispose();

        expect(events).toEqual(["mount:editor", "unmount:editor"]);
        expect(runtime.getEditor(target)).toBeUndefined();
        expect(runtime.getSelection()).toBeNull();
    });
});
