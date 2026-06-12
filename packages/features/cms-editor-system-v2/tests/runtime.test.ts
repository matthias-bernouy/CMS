import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import type { SettingSection } from "@bernouy/cms-content/editor";
import {
    CMS_EDITOR_SETTINGS_CHANGE_EVENT,
    EditorRegistry,
    RuntimeEditor,
    type RuntimeEditorSettingsChangeDetail,
} from "../src/runtime";

function createDocument() {
    return parseHTML(`
        <!DOCTYPE html>
        <html>
            <body>
                <section id="parent">
                    <article id="direct-child">
                        <button id="nested-child"></button>
                    </article>
                    <aside id="sibling-child"></aside>
                </section>
            </body>
        </html>
    `).document;
}

class LifecycleEditor extends RuntimeEditor {
    mounted = 0;
    unmounted = 0;

    override mountEditor(): void {
        this.mounted++;
    }

    override unmountEditor(): void {
        this.unmounted++;
    }
}

describe("RuntimeEditor", () => {
    test("registers editors and resolves direct editor children", () => {
        const document = createDocument();
        const registry = new EditorRegistry();

        const parent = new RuntimeEditor(document.getElementById("parent")!, registry);
        const directChild = new RuntimeEditor(document.getElementById("direct-child")!, registry);
        const nestedChild = new RuntimeEditor(document.getElementById("nested-child")!, registry);
        const siblingChild = new RuntimeEditor(document.getElementById("sibling-child")!, registry);

        expect(registry.getEditor(parent.target)).toBe(parent);
        expect(parent.getChildren()).toEqual([directChild, siblingChild]);
        expect(directChild.getChildren()).toEqual([nestedChild]);
        expect(nestedChild.getChildren()).toEqual([]);
    });

    test("adds runtime settings and emits a settings-change event", () => {
        const document = createDocument();
        const registry = new EditorRegistry();
        const editor = new RuntimeEditor(document.getElementById("direct-child")!, registry);

        const gridOverride: SettingSection = {
            kind: "surcharge",
            label: "Grid",
            settings: [
                {
                    type: "select",
                    label: "Columns",
                    attribute: "cms-grid-columns",
                    options: [
                        { label: "1 column", value: "1" },
                        { label: "2 columns", value: "2" },
                    ],
                },
            ],
        };

        let eventDetail: RuntimeEditorSettingsChangeDetail | undefined;
        editor.target.addEventListener(CMS_EDITOR_SETTINGS_CHANGE_EVENT, (event) => {
            eventDetail = (event as CustomEvent<RuntimeEditorSettingsChangeDetail>).detail;
        });

        editor.addSettings(gridOverride);

        expect(editor.getSettings()).toEqual([gridOverride]);
        expect(eventDetail?.editor).toBe(editor);
        expect(eventDetail?.settings).toEqual([gridOverride]);
    });

    test("unregisters disposed editors", () => {
        const document = createDocument();
        const registry = new EditorRegistry();
        const editor = new RuntimeEditor(document.getElementById("direct-child")!, registry);

        editor.dispose();

        expect(registry.getEditor(editor.target)).toBeUndefined();
    });

    test("runs stable editor lifecycle hooks idempotently", () => {
        const document = createDocument();
        const registry = new EditorRegistry();
        const editor = new LifecycleEditor(document.getElementById("direct-child")!, registry);

        editor.mount();
        editor.mount();
        expect(editor.mounted).toBe(1);

        editor.unmount();
        editor.unmount();
        expect(editor.unmounted).toBe(1);
    });

    test("unmounts before unregistering on dispose", () => {
        const document = createDocument();
        const registry = new EditorRegistry();
        const editor = new LifecycleEditor(document.getElementById("direct-child")!, registry);

        editor.mount();
        editor.dispose();

        expect(editor.unmounted).toBe(1);
        expect(registry.getEditor(editor.target)).toBeUndefined();
    });
});
